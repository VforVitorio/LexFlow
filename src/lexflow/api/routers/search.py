"""Search endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from lexflow.api.dependencies import get_law_registry
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import SearchResponse

router = APIRouter(tags=["Search"])


@router.get(
    "/search",
    response_model=SearchResponse,
    summary="Full-text search across all laws",
)
async def search_laws(
    q: str = Query(..., min_length=2, max_length=200, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    registry: LawRegistry = Depends(get_law_registry),
) -> SearchResponse:
    """Search across all laws and articles for the given query string."""
    return registry.search_text(q, page=page, page_size=page_size)
