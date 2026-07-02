"""SQLModel table for personal, user-local law tags (issue #670).

Single-user desktop app — there is no ``user_id`` column. Every row
attaches one normalised tag slug to one ``law_id``, alongside the raw
display text (``label``) the user typed. The unique constraint on
``(law_id, tag)`` makes tagging idempotent: re-adding the same
normalised tag to the same law resolves to the existing row instead of
duplicating it (see the insert-or-return logic in
:mod:`lexflow.api.routers.user_tags`).

Persistence reuses the chat-thread SQLite database
(:mod:`lexflow.chat.db`) — this module does not open its own engine.

--- WHERE TO CHANGE IF X CHANGES ---
* Multi-user support      → add a ``user_id`` column and widen the
                             unique constraint to
                             ``(user_id, law_id, tag)``.
* Schema breaking change   → add a migration (no Alembic yet;
                             ``create_all`` is fine until a real
                             release ships).
"""

import uuid
from datetime import UTC, datetime

from sqlmodel import Field, SQLModel, UniqueConstraint


def _new_id() -> str:
    """Stable id factory. Hex string so it's URL-safe and short."""
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    """Naive timezone-aware UTC stamp. SQLite stores as ISO string."""
    return datetime.now(UTC)


class UserTag(SQLModel, table=True):
    """One personal tag attached to a law by the (single) local user.

    ``tag`` is the normalised kebab-case slug produced by
    :func:`lexflow.core.parser.normalize_tag`; ``label`` is the raw
    text the user typed, kept only for display. ``created_at`` breaks
    ties when picking a representative label for the global vocabulary
    listing (``GET /api/v1/user-tags``).
    """

    __tablename__ = "user_tags"
    __table_args__ = (UniqueConstraint("law_id", "tag", name="uq_user_tag_law_tag"),)

    id: str = Field(default_factory=_new_id, primary_key=True)
    law_id: str = Field(index=True)
    tag: str = Field(index=True)
    label: str = Field(default="")
    created_at: datetime = Field(default_factory=_utcnow)
