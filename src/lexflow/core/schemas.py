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
        """Whether there is a previous page.

        Audit #409: the old definition (``self.page > 1``) returned
        ``True`` for any out-of-range page (e.g. ``page=500`` with
        ``total_pages=5``), so the SPA pager rendered "previous-only"
        controls for non-existent pages. We now require the page to
        be in range, matching ``has_next``'s symmetric definition.
        """
        return 1 < self.page <= self.total_pages


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
    # #671 — official topic tags (BOE `subjects` etc.), normalised to
    # kebab-case slugs by the parser. Surfaced on summaries so the Explorer
    # renders tag chips and the `#tag` filter works without a detail fetch.
    # Custom user tags (#670) are a separate user-local layer — never here.
    tags: list[str] = Field(default_factory=list, description="Normalised official topic tags.")
    # #671 gap B — issuing department/ministerio (BOE `department` field).
    # Surfaced on summaries so the Explorer's department facet can filter
    # and render the active chip without a detail fetch. Unlike `tags`, this
    # is a single free-text value straight from BOE metadata — no slugging.
    department: str | None = Field(default=None, description="Issuing department / ministerio, when known.")


class LawDetail(BaseModel):
    """Full law detail for the single-law endpoint."""

    metadata: LawMetadata
    sections: list[Section]
    articles: list[Article]
    references: list[Reference]
    article_count: int


class LawReferencesResponse(BaseModel):
    """References for a single law (#96).

    Returned by ``GET /api/v1/laws/{law_id}/references``. Wrapped in an
    object (rather than a bare ``list[Reference]``) per the Sprint 6
    api-6 convention — leaves room for future metadata fields (e.g.
    pagination once a law's reference set grows) without breaking the
    client.
    """

    references: list[Reference]
    total: int


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


class SemanticSearchHit(BaseModel):
    """One row of a semantic-search response (#43).

    Distinct from :class:`SearchResult` because the wire fields differ:
    semantic hits expose a normalised cosine ``score`` in
    ``[-1, 1]`` (rank-relative, not absolute), and they don't carry
    text-match offsets — there's no literal substring to highlight.
    """

    law_id: str
    article_number: str
    snippet: str
    score: float = Field(..., ge=-1.0, le=1.0)


class SemanticSearchResponse(BaseModel):
    """Wrapper around the semantic-search hit list (Sprint 6 api-6)."""

    query: str
    items: list[SemanticSearchHit]


class HybridSearchHit(BaseModel):
    """One row of a hybrid (full-text + semantic) search response (#43).

    ``score`` is a fused Reciprocal Rank Fusion score — NOT comparable to
    the full-text or cosine scales, only meaningful as a relative ranking.
    ``sources`` lists which rankers surfaced this article (``full_text`` /
    ``semantic``); a hit found by both is the strongest signal.
    ``article_number`` is nullable because a full-text hit can match a law
    title rather than a specific article.
    """

    law_id: str
    article_number: str | None
    snippet: str
    score: float = Field(..., ge=0.0, description="Fused RRF score (relative ranking only).")
    sources: list[str] = Field(..., description="Rankers that surfaced this hit: 'full_text' and/or 'semantic'.")


class HybridSearchResponse(BaseModel):
    """Wrapper around the hybrid-search hit list (#43)."""

    query: str
    items: list[HybridSearchHit]


# ---------------------------------------------------------------------------
# Tags (#145)
# ---------------------------------------------------------------------------


class TagCount(BaseModel):
    """A normalised tag and how many laws carry it."""

    tag: str = Field(..., description="Normalised kebab-case tag slug.")
    count: int = Field(..., ge=0, description="Number of laws tagged with it.")


# ---------------------------------------------------------------------------
# Departments (#671 gap B)
# ---------------------------------------------------------------------------


class DepartmentCount(BaseModel):
    """An issuing department (ministerio) and how many laws it issued."""

    department: str = Field(..., description="Issuing department / ministerio name.")
    count: int = Field(..., ge=0, description="Number of laws attributed to it.")


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


class GraphGlobalResponse(BaseModel):
    """Response for the global graph endpoint (#146).

    Same shape as ``GraphSubgraphResponse`` plus ``total_available``,
    which carries the number of nodes that matched the filters BEFORE
    ``limit`` truncated. Lets the SPA show "showing N of M laws".
    """

    nodes: list[GraphNodeData]
    edges: list[GraphEdgeData]
    total_available: int


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


class DepartmentsResponse(BaseModel):
    """Wrapper for ``GET /api/v1/departments`` (#671 gap B)."""

    items: list[DepartmentCount]


# ---------------------------------------------------------------------------
# System / warm-up (#222)
# ---------------------------------------------------------------------------


class WarmupStatusResponse(BaseModel):
    """Snapshot of the post-startup background warm-up (#222).

    Polled by the SPA every 2-3 s until ``ready`` flips to true so the
    UI can show specific "still loading X" messages instead of the
    generic spinner.
    """

    ready: bool = Field(..., description="Core warm-up stages (metadata, search, graph) complete.")
    metadata_ready: bool = Field(..., description="Frontmatter preload finished.")
    search_ready: bool = Field(..., description="In-memory search index built.")
    graph_ready: bool = Field(..., description="Knowledge graph loaded/rebuilt.")
    semantic_ready: bool = Field(
        default=False,
        description="Opt-in semantic index pre-built (#548). Not part of `ready` — semantic search is optional.",
    )
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


class SemanticStatusResponse(BaseModel):
    """Whether real semantic search is available + active (#43).

    Drives the Settings → Models "semantic search" card: shows if the
    optional ``[semantic]`` extra is installed, which backend is configured,
    and whether real (model-based) ranking is actually in effect.
    """

    backend: str = Field(..., description="Configured embedder backend: 'hash' or 'sentence-transformers'.")
    installed: bool = Field(..., description="Whether the optional sentence-transformers dependency is importable.")
    active: bool = Field(
        ...,
        description="True when real semantic ranking is in effect (backend selected AND dependency installed).",
    )
    model: str = Field(..., description="Configured sentence-transformers model name (used when active).")
