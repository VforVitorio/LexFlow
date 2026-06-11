"""Law endpoints: list and detail.

Handlers are sync ``def`` because ``registry.get_law`` and ``list_laws`` hit
blocking I/O (Path.read_text + YAML parse + regex on multi-MB files) on first
access. FastAPI runs sync handlers on a threadpool, which keeps the event
loop free; declaring them ``async def`` would block every other request on
the same loop while a cold law is parsed.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from lexflow.api.dependencies import PaginationParams, get_law_registry
from lexflow.core.enums import LawRank, LawStatus, Scope
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import LawDetail, LawReferencesResponse, LawSummary, PaginatedResponse

router = APIRouter(prefix="/laws", tags=["Laws"])


@router.get(
    "",
    response_model=PaginatedResponse[LawSummary],
    summary="List laws with filtering and pagination",
)
def list_laws(
    pagination: Annotated[PaginationParams, Depends()],
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
    rank: LawRank | None = Query(None, description="Filter by law rank"),
    status: LawStatus | None = Query(None, description="Filter by enforcement status"),
    scope: Scope | None = Query(None, description="Filter by territorial scope"),
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction code (e.g. es-md)"),
    year_from: int | None = Query(None, ge=0, description="Earliest publication year (inclusive)"),
    year_to: int | None = Query(None, ge=0, description="Latest publication year (inclusive)"),
) -> PaginatedResponse[LawSummary]:
    """Return a paginated list of laws.  All filters are optional."""
    return registry.list_laws(
        page=pagination.page,
        page_size=pagination.page_size,
        rank=rank,
        status=status,
        scope=scope,
        jurisdiction=jurisdiction,
        year_from=year_from,
        year_to=year_to,
    )


@router.get(
    "/{law_id}",
    response_model=LawDetail,
    summary="Get full detail of a specific law",
)
def get_law(
    law_id: str,
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
) -> LawDetail:
    """Return the complete parsed representation of a law."""
    law = registry.get_law(law_id)
    return LawDetail(
        metadata=law.metadata,
        sections=law.sections,
        articles=law.articles,
        references=law.references,
        article_count=law.article_count,
    )


@router.get(
    "/{law_id}/references",
    response_model=LawReferencesResponse,
    summary="Get just the cross-references for a law (#96)",
)
def get_law_references(
    law_id: str,
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
    include_unresolved: bool = Query(
        False,
        description="If False (default), only references whose target_id resolves to a known law. If True, also includes raw textual mentions whose target is not in the corpus.",
    ),
) -> LawReferencesResponse:
    """Return just the cross-references for ``law_id``.

    The legacy path was for the frontend to call ``/laws/{id}`` and
    filter ``articles[].references`` client-side — that transferred
    the entire law body (often MB) just to read a few KB of refs.
    This endpoint returns only what's needed.
    """
    law = registry.get_law(law_id)
    refs = law.references
    if not include_unresolved:
        refs = [r for r in refs if r.target_id is not None]
    return LawReferencesResponse(references=list(refs), total=len(refs))
