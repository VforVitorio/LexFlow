"""Article endpoints: list articles within a law, get a single article."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from lexflow.api.dependencies import PaginationParams, get_law_registry
from lexflow.core.exceptions import ArticleNotFoundError
from lexflow.core.models import Article
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import ArticleResponse, PaginatedResponse

router = APIRouter(prefix="/laws/{law_id}/articles", tags=["Articles"])


@router.get(
    "",
    response_model=PaginatedResponse[Article],
    summary="List all articles of a law",
)
async def list_articles(
    law_id: str,
    pagination: PaginationParams = Depends(),
    registry: LawRegistry = Depends(get_law_registry),
) -> PaginatedResponse[Article]:
    """Return a paginated list of articles for the given law."""
    law = registry.get_law(law_id)
    articles = law.articles
    start = (pagination.page - 1) * pagination.page_size
    end = start + pagination.page_size
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
async def get_article(
    law_id: str,
    article_number: str,
    registry: LawRegistry = Depends(get_law_registry),
) -> ArticleResponse:
    """Return a single article by its number within a law."""
    law = registry.get_law(law_id)
    article = _find_article(law.articles, article_number)
    if article is None:
        raise ArticleNotFoundError(law_id, article_number)
    return ArticleResponse(
        law_id=law_id,
        law_title=law.metadata.title,
        article=article,
    )


def _find_article(articles: list[Article], number: str) -> Article | None:
    """Find an article by number, with normalization of trailing dots."""
    normalized = number.strip().rstrip(".")
    for article in articles:
        if article.number.strip().rstrip(".") == normalized:
            return article
    return None
