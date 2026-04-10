"""Law endpoints: list and detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from lexflow.api.dependencies import PaginationParams, get_law_registry
from lexflow.core.enums import LawRank, LawStatus, Scope
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import LawDetail, LawSummary, PaginatedResponse

router = APIRouter(prefix="/laws", tags=["Laws"])


@router.get(
    "",
    response_model=PaginatedResponse[LawSummary],
    summary="List laws with filtering and pagination",
)
async def list_laws(
    pagination: PaginationParams = Depends(),
    registry: LawRegistry = Depends(get_law_registry),
    rank: LawRank | None = Query(None, description="Filter by law rank"),
    status: LawStatus | None = Query(None, description="Filter by enforcement status"),
    scope: Scope | None = Query(None, description="Filter by territorial scope"),
    jurisdiction: str | None = Query(None, description="Filter by jurisdiction code (e.g. es-md)"),
) -> PaginatedResponse[LawSummary]:
    """Return a paginated list of laws.  All filters are optional."""
    return registry.list_laws(
        page=pagination.page,
        page_size=pagination.page_size,
        rank=rank,
        status=status,
        scope=scope,
        jurisdiction=jurisdiction,
    )


@router.get(
    "/{law_id}",
    response_model=LawDetail,
    summary="Get full detail of a specific law",
)
async def get_law(
    law_id: str,
    registry: LawRegistry = Depends(get_law_registry),
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
