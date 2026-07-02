"""``/api/v1`` — CRUD + vocabulary for personal, user-local law tags (issue #670).

Five endpoints:

* ``GET    /laws/{law_id}/user-tags``       — list a law's tags
* ``POST   /laws/{law_id}/user-tags``       — attach a tag (idempotent)
* ``DELETE /laws/{law_id}/user-tags/{tag}`` — remove a tag (idempotent)
* ``GET    /user-tags``                     — global tag vocabulary, ranked by usage
* ``GET    /user-tags/{tag}/laws``          — laws carrying a given tag

Persistence is SQLite via :mod:`lexflow.chat.db` (the user-tags table
lives in the same file as the chat tables — a single local user, a
single local DB). Tag normalisation reuses
:func:`lexflow.core.parser.normalize_tag` so a user-typed tag and a
frontmatter ``subjects`` tag collapse to the same slug convention.

--- WHERE TO CHANGE IF X CHANGES ---
* Schema     →  ``lexflow.user_tags.schemas``.
* Storage    →  ``lexflow.user_tags.models`` (the ``UserTag`` table).
* Wiring     →  ``lexflow.api.app`` registers this router and imports
                ``lexflow.user_tags.models`` so ``create_all`` sees the
                table — this module does not do that itself.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from lexflow.chat.db import get_session
from lexflow.core.parser import normalize_tag
from lexflow.user_tags.models import UserTag
from lexflow.user_tags.schemas import (
    UserTagCount,
    UserTagCreate,
    UserTagLawsResponse,
    UserTagRead,
    UserTagsResponse,
    UserTagVocabResponse,
)

router = APIRouter(tags=["User tags"])


# ---------------------------------------------------------------------------
# Helpers — keep route handlers thin
# ---------------------------------------------------------------------------


def _normalize_or_422(raw_label: str) -> str:
    """Slugify *raw_label*, rejecting input that has no alphanumeric content."""
    slug = normalize_tag(raw_label)
    if not slug:
        raise HTTPException(status_code=422, detail="Tag is empty after normalisation")
    return slug


def _find_tag(session: Session, law_id: str, slug: str) -> UserTag | None:
    """Look up the (law_id, slug) row, or ``None`` if it doesn't exist."""
    statement = select(UserTag).where(UserTag.law_id == law_id, UserTag.tag == slug)
    return session.exec(statement).first()


def _aggregate_vocabulary(rows: list[UserTag]) -> list[UserTagCount]:
    """Group tag rows by slug into ranked ``(tag, label, count)`` entries.

    ``count`` is the number of *distinct laws* carrying the slug (not
    the row count — the unique constraint already guarantees at most
    one row per (law_id, tag), but grouping by set is the honest
    invariant to encode here). ``label`` is the most recently created
    row's label for that slug, picked deterministically by
    ``created_at``. Sorted by count desc, then tag asc.
    """
    rows_by_tag: dict[str, list[UserTag]] = {}
    for row in rows:
        rows_by_tag.setdefault(row.tag, []).append(row)

    entries = [_vocabulary_entry(slug, tag_rows) for slug, tag_rows in rows_by_tag.items()]
    entries.sort(key=lambda entry: (-entry.count, entry.tag))
    return entries


def _vocabulary_entry(slug: str, tag_rows: list[UserTag]) -> UserTagCount:
    """Build one ranked vocabulary entry for a single tag slug."""
    distinct_law_ids = {row.law_id for row in tag_rows}
    most_recent = max(tag_rows, key=lambda row: row.created_at)
    return UserTagCount(tag=slug, label=most_recent.label, count=len(distinct_law_ids))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/laws/{law_id}/user-tags",
    response_model=UserTagsResponse,
    summary="List the personal tags attached to a law.",
)
def list_user_tags_for_law(
    law_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> UserTagsResponse:
    """Return a law's tags in insertion order (oldest first)."""
    statement = select(UserTag).where(UserTag.law_id == law_id).order_by(col(UserTag.created_at))
    rows = session.exec(statement).all()
    return UserTagsResponse(items=[UserTagRead(tag=row.tag, label=row.label) for row in rows])


@router.post(
    "/laws/{law_id}/user-tags",
    response_model=UserTagRead,
    status_code=status.HTTP_201_CREATED,
    summary="Attach a personal tag to a law. Idempotent — re-adding the same label returns 200.",
)
def add_user_tag(
    law_id: str,
    body: UserTagCreate,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> UserTagRead:
    """Normalise the label to a slug, then insert-or-return the existing row.

    The unique constraint on ``(law_id, tag)`` makes this idempotent:
    when a row already exists we return it unchanged with 200 (via
    ``response.status_code``); otherwise we create it and the route's
    default 201 applies.
    """
    slug = _normalize_or_422(body.label)

    existing = _find_tag(session, law_id, slug)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return UserTagRead(tag=existing.tag, label=existing.label)

    tag_row = UserTag(law_id=law_id, tag=slug, label=body.label)
    session.add(tag_row)
    try:
        session.commit()
    except IntegrityError:
        # TOCTOU: a concurrent POST for the same (law_id, tag) committed
        # between the existence check above and here, tripping the unique
        # constraint. Roll back and return the row that won the race — the
        # documented idempotent 200, never a generic 500.
        session.rollback()
        winner = _find_tag(session, law_id, slug)
        if winner is None:
            raise
        response.status_code = status.HTTP_200_OK
        return UserTagRead(tag=winner.tag, label=winner.label)
    session.refresh(tag_row)
    return UserTagRead(tag=tag_row.tag, label=tag_row.label)


@router.delete(
    "/laws/{law_id}/user-tags/{tag}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a personal tag from a law. Idempotent.",
)
def delete_user_tag(
    law_id: str,
    tag: str,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Delete the (law_id, tag) row if present; 204 either way (RFC 7231).

    ``tag`` is normalised defensively so a client that passes a raw
    label instead of the slug still resolves to the right row.
    """
    slug = normalize_tag(tag)
    row = _find_tag(session, law_id, slug)
    if row is None:
        return
    session.delete(row)
    session.commit()


@router.get(
    "/user-tags",
    response_model=UserTagVocabResponse,
    summary="List every personal tag across all laws, ranked by how many laws use it.",
)
def list_user_tag_vocabulary(
    session: Annotated[Session, Depends(get_session)],
) -> UserTagVocabResponse:
    """Aggregate in Python.

    A single desktop user's tag vocabulary is small (dozens to low
    hundreds of rows), so a full-table fetch plus an in-memory
    group-by is clearer than a second SQL aggregation shape to
    maintain, and avoids any SQLite-specific ``GROUP BY`` quirks.
    """
    rows = session.exec(select(UserTag)).all()
    return UserTagVocabResponse(items=_aggregate_vocabulary(list(rows)))


@router.get(
    "/user-tags/{tag}/laws",
    response_model=UserTagLawsResponse,
    summary="List the ids of laws carrying a given personal tag.",
)
def list_laws_for_user_tag(
    tag: str,
    session: Annotated[Session, Depends(get_session)],
) -> UserTagLawsResponse:
    """``tag`` is expected to already be a slug; normalised again defensively."""
    slug = normalize_tag(tag)
    statement = select(UserTag).where(UserTag.tag == slug)
    rows = session.exec(statement).all()
    law_ids = sorted({row.law_id for row in rows})
    return UserTagLawsResponse(law_ids=law_ids)
