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
    """A single search hit.

    ``match_start`` / ``match_end`` are character offsets within ``snippet``
    (not the source text) pointing at the substring the frontend should
    visually highlight. ``None`` when the snippet had to be returned
    without an explicit match anchor — e.g. the query lay outside the
    trimmed window or the snippet was synthesised from a title-only match.
    """

    law_id: str
    law_title: str
    article_number: str | None
    snippet: str = Field(..., description="Text fragment with match context.")
    match_start: int | None = Field(
        default=None,
        ge=0,
        description="Start offset of the match within ``snippet`` (inclusive). Null when not locatable.",
    )
    match_end: int | None = Field(
        default=None,
        ge=0,
        description="Exclusive end offset of the match within ``snippet``. Null when not locatable.",
    )
    score: float = Field(ge=0.0)


class SearchResponse(BaseModel):
    """Search results wrapper."""

    query: str
    total: int
    items: list[SearchResult]
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Tags (#145)
# ---------------------------------------------------------------------------


class TagCount(BaseModel):
    """A normalised tag and how many laws carry it."""

    tag: str = Field(..., description="Normalised kebab-case tag slug.")
    count: int = Field(..., ge=0, description="Number of laws tagged with it.")


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
    """Node representation for subgraph responses.

    ``community`` and ``pagerank`` (issue #143) are computed over the
    returned subgraph — not the global graph — so they stay meaningful
    as the seed/depth change. The frontend uses ``community`` to colour
    clusters and ``pagerank`` to size nodes.
    """

    id: str
    title: str | None = None
    rank: str | None = None
    status: str | None = None
    community: int | None = None
    pagerank: float | None = None


class GraphEdgeData(BaseModel):
    """Edge representation for subgraph responses.

    ``kind`` carries the relationship type (cites / modifies / repeals /
    develops, #144). Older cached graphs that pre-date the typing
    surface ``None`` here — the frontend treats it as ``cites``.
    """

    source: str
    target: str
    source_article: str | None = None
    kind: str | None = None


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


class GraphTopResponse(BaseModel):
    """Wrapper for ``GET /api/v1/graph/top`` (Sprint 6 api-6).

    Top-level JSON arrays are a known design smell (JSON-hijacking risk
    in some clients, no room to grow metadata). Every list endpoint
    wraps its rows in an object with a single ``items`` key.
    """

    items: list[GraphTopItem]


class GraphPathResponse(BaseModel):
    """Wrapper for ``GET /api/v1/graph/path`` (Sprint 6 api-6)."""

    path: list[str]


class TagsResponse(BaseModel):
    """Wrapper for ``GET /api/v1/tags`` (Sprint 6 api-6)."""

    items: list[TagCount]


# ---------------------------------------------------------------------------
# System / warm-up (#222)
# ---------------------------------------------------------------------------


class WarmupStatusResponse(BaseModel):
    """Snapshot of the post-startup background warm-up (#222).

    Polled by the SPA every 2-3 s until ``ready`` flips to true so the
    UI can show specific "still loading X" messages instead of the
    generic spinner.
    """

    ready: bool = Field(..., description="All warm-up stages complete.")
    metadata_ready: bool = Field(..., description="Frontmatter preload finished.")
    search_ready: bool = Field(..., description="In-memory search index built.")
    graph_ready: bool = Field(..., description="Knowledge graph loaded/rebuilt.")
    error: str | None = Field(
        default=None,
        description="Last warm-up error message, if any stage failed (the other stages can still report ready).",
    )
    durations_seconds: dict[str, float] = Field(
        default_factory=dict,
        description="Wall-clock seconds spent in each completed stage. Useful for triage.",
    )


class WhatsNewLaw(BaseModel):
    """A law that changed between two corpus revisions."""

    law_id: str
    title: str | None = None


class WhatsNewCorpus(BaseModel):
    """Corpus diff summary for the what's-new splash panel (#228)."""

    from_commit: str | None = None
    to_commit: str | None = None
    added: list[WhatsNewLaw] = Field(default_factory=list)
    modified: list[WhatsNewLaw] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)


class WhatsNewResponse(BaseModel):
    """Response for GET /system/whats-new — what changed since last launch (#228)."""

    corpus: WhatsNewCorpus


class SystemProfileResponse(BaseModel):
    """Hardware + local-provider snapshot consumed by the model wizard (#117/#118).

    Numbers are point-in-time and meant for one-shot wizard logic — the
    frontend should not poll this endpoint. The wizard re-runs detection
    only when the user explicitly relaunches it from Ajustes → Modelos.
    """

    total_ram_gb: float = Field(..., description="Total physical RAM in GiB.")
    available_ram_gb: float = Field(..., description="Free RAM at probe time, GiB.")
    cpu_cores: int = Field(..., description="Logical CPU count (hyperthreads included).")
    has_nvidia_gpu: bool = Field(..., description="Whether NVML reported at least one NVIDIA GPU.")
    vram_gb: float | None = Field(
        default=None,
        description="VRAM of the first NVIDIA GPU in GiB, or null if no GPU is present.",
    )
    gpu_name: str | None = Field(
        default=None,
        description="Marketing name of the first NVIDIA GPU (e.g. 'NVIDIA GeForce RTX 4070').",
    )
    is_apple_silicon: bool = Field(
        ...,
        description="True on ARM64 macOS so the wizard can recommend MLX/unified-memory tiers.",
    )
    platform: str = Field(..., description="Short OS label: 'linux', 'darwin' or 'windows'.")
    ollama_running: bool = Field(..., description="Whether Ollama responded on http://127.0.0.1:11434.")
    ollama_models: list[str] = Field(
        default_factory=list,
        description="Model tags currently installed in Ollama (empty when Ollama is not running).",
    )
    lmstudio_running: bool = Field(..., description="Whether LM Studio responded on http://127.0.0.1:1234.")
