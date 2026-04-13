"""API response schemas — thin wrappers over domain models for serialization."""

from __future__ import annotations

from datetime import date
from typing import Generic, TypeVar

from pydantic import BaseModel, Field, computed_field

from lexflow.core.enums import LawRank, LawStatus, Scope
from lexflow.core.models import Article, LawMetadata, Reference, Section

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Generic pagination
# ---------------------------------------------------------------------------


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""

    items: list[T]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_pages(self) -> int:
        """Total number of pages."""
        return max(1, (self.total + self.page_size - 1) // self.page_size)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_next(self) -> bool:
        """Whether there is a next page."""
        return self.page < self.total_pages

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_previous(self) -> bool:
        """Whether there is a previous page."""
        return self.page > 1


# ---------------------------------------------------------------------------
# Law summaries and details
# ---------------------------------------------------------------------------


class LawSummary(BaseModel):
    """Lightweight law representation for list endpoints."""

    identifier: str
    title: str
    rank: LawRank
    status: LawStatus
    publication_date: date | None
    article_count: int
    scope: Scope
    jurisdiction: str | None


class LawDetail(BaseModel):
    """Full law detail for the single-law endpoint."""

    metadata: LawMetadata
    sections: list[Section]
    articles: list[Article]
    references: list[Reference]
    article_count: int


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------


class ArticleResponse(BaseModel):
    """Single article response with parent law context."""

    law_id: str
    law_title: str
    article: Article


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class SearchResult(BaseModel):
    """A single search hit."""

    law_id: str
    law_title: str
    article_number: str | None
    snippet: str = Field(..., description="Text fragment with match context.")
    score: float = Field(ge=0.0)


class SearchResponse(BaseModel):
    """Search results wrapper."""

    query: str
    total: int
    items: list[SearchResult]
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ErrorResponse(BaseModel):
    """Standardized error response."""

    error: str
    message: str
    detail: str | None = None


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


class GraphNeighborsResponse(BaseModel):
    """Response for the graph neighbors endpoint."""

    law_id: str
    neighbors: list[str]
    count: int


class GraphNodeData(BaseModel):
    """Minimal node representation for subgraph responses."""

    id: str
    title: str | None = None
    rank: str | None = None
    status: str | None = None


class GraphEdgeData(BaseModel):
    """Edge representation for subgraph responses."""

    source: str
    target: str
    source_article: str | None = None


class GraphSubgraphResponse(BaseModel):
    """Response for the subgraph endpoint."""

    nodes: list[GraphNodeData]
    edges: list[GraphEdgeData]


class GraphStatsResponse(BaseModel):
    """High-level statistics about the knowledge graph."""

    node_count: int
    edge_count: int
    density: float
    weakly_connected_components: int


class GraphTopItem(BaseModel):
    """A law ranked by PageRank score."""

    law_id: str
    score: float
    title: str | None = None
