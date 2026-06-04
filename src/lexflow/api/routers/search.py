"""Full-text search endpoints.

Canonical route is ``/api/v1/laws/search`` — search *over laws*, so it
nests under the ``laws`` resource like ``/laws/{id}/articles`` and
``/laws/{id}/versions`` (#102). ``/api/v1/search`` stays as a deprecated
alias (emits a ``Deprecation: true`` header) until v2.

--- WHERE TO CHANGE IF X CHANGES ---
* Search logic        → ``LawRegistry.search_text``.
* Drop the alias      → remove ``search_laws_deprecated`` + its route at v2.
* Semantic search     → add a ``mode=`` query param on the canonical
                        route (issue #43).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from lexflow.api.dependencies import get_law_registry, get_search_index
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import SearchResponse, SemanticSearchHit, SemanticSearchResponse
from lexflow.search.semantic_index import SemanticIndex

router = APIRouter(tags=["Search"])


def _run_search(
    q: str,
    page: int,
    page_size: int,
    registry: LawRegistry,
) -> SearchResponse:
    """Shared search execution for both the canonical + deprecated routes."""
    return registry.search_text(q, page=page, page_size=page_size)


@router.get(
    "/laws/search",
    response_model=SearchResponse,
    summary="Full-text search across all laws",
)
def search_laws(
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
    q: str = Query(..., min_length=2, max_length=200, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> SearchResponse:
    """Search across all laws and articles for the given query string."""
    return _run_search(q, page, page_size, registry)


@router.get(
    "/laws/search/semantic",
    response_model=SemanticSearchResponse,
    summary="Semantic search over the corpus's articles (#43).",
)
def search_semantic(
    index: Annotated[SemanticIndex, Depends(get_search_index)],
    q: str = Query(..., min_length=2, max_length=500, description="Natural-language query"),
    limit: int = Query(10, ge=1, le=50, description="Top-N hits by cosine similarity"),
) -> SemanticSearchResponse:
    """Rank articles by cosine similarity to the query embedding.

    The index is built lazily on the first call (one embed pass over
    every article in the corpus). Subsequent queries reuse the
    cached vectors. After a ``POST /sync`` triggers a corpus refresh,
    the sync router calls ``reset_semantic_index`` so the next query
    rebuilds against the new data.

    Out of scope of this endpoint (separate follow-ups):
      * Hybrid ranking that combines this with ``/laws/search``.
      * Cross-encoder re-ranking on the top-K.
      * The real embedder (today's ``HashEmbedder`` is a placeholder;
        see ``search/embeddings.py``).
    """
    hits = index.query(q, limit=limit)
    return SemanticSearchResponse(
        query=q,
        items=[
            SemanticSearchHit(
                law_id=hit.law_id,
                article_number=hit.article_number,
                snippet=hit.snippet,
                score=hit.score,
            )
            for hit in hits
        ],
    )


@router.get(
    "/search",
    response_model=SearchResponse,
    summary="[Deprecated] Use /laws/search instead",
    deprecated=True,
)
def search_laws_deprecated(
    response: Response,
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
    q: str = Query(..., min_length=2, max_length=200, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> SearchResponse:
    """Deprecated alias for ``/laws/search``.

    Kept working through v1 so existing clients don't break, but flagged
    with a ``Deprecation: true`` header (RFC 8594 style) + a ``Link``
    pointing at the successor route. Remove at the v2 cut.
    """
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</api/v1/laws/search>; rel="successor-version"'
    return _run_search(q, page, page_size, registry)
