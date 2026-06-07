"""Article endpoints: list articles within a law, get a single article.

Handlers are sync ``def`` for the same reason as ``laws.py``: registry access
performs blocking I/O on first hit and would freeze the event loop if run
on an ``async`` coroutine.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from lexflow.api.dependencies import PaginationParams, get_law_registry
from lexflow.core.exceptions import ArticleNotFoundError
from lexflow.core.models import Article
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import ArticleResponse, PaginatedResponse
from lexflow.core.services import find_article

router = APIRouter(prefix="/laws/{law_id}/articles", tags=["Articles"])


@router.get(
    "",
    response_model=PaginatedResponse[Article],
    summary="List all articles of a law (DEPRECATED — use GET /laws/{id}.articles).",
    deprecated=True,
)
def list_articles(
    law_id: str,
    pagination: Annotated[PaginationParams, Depends()],
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
    response: Response = None,  # type: ignore[assignment]
) -> PaginatedResponse[Article]:
    """Return a paginated list of articles for the given law.

    Audit #479 — DEPRECATED. The SPA already gets the full article
    list embedded in ``GET /laws/{law_id}.articles`` (Sprint 16 wiring)
    and never calls this endpoint. We keep it for external consumers
    (third-party scripts / Postman collections) but mark it with the
    standard ``Deprecation`` + ``Sunset`` headers so anyone still on it
    has time to migrate before the next major.

    Sunset date is left intentionally generous (one year out); a
    ``GET /laws/{id}`` response is the supported migration path.
    """
    law = registry.get_law(law_id)
    articles = law.articles
    start = (pagination.page - 1) * pagination.page_size
    end = start + pagination.page_size
    if response is not None:
        # RFC 8594 + RFC 9745. Static values so the client can cache
        # the migration decision; bump the Sunset when an /api/v2 ships.
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = "Sat, 06 Jun 2026 00:00:00 GMT"
        response.headers["Link"] = '</api/v1/laws/{law_id}>; rel="successor-version"'
    return PaginatedResponse(
        items=articles[start:end],
        total=len(articles),
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get(
    "/{article_number}",
    response_model=ArticleResponse,
    summary="Get a specific article by number",
)
def get_article(
    law_id: str,
    article_number: str,
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
) -> ArticleResponse:
    """Return a single article by its number within a law."""
    law = registry.get_law(law_id)
    article = find_article(law, article_number)
    if article is None:
        raise ArticleNotFoundError(law_id, article_number)
    return ArticleResponse(
        law_id=law_id,
        law_title=law.metadata.title,
        article=article,
    )
