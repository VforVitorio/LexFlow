"""FastAPI dependency injection providers."""

from __future__ import annotations

import threading

from fastapi import Depends, Query

from lexflow.core.registry import LawRegistry, get_registry
from lexflow.graph.cache import load_or_build as _load_or_build_graph
from lexflow.graph.model import LegalGraph
from lexflow.search.index_cache import load_or_build as _load_or_build_index
from lexflow.search.semantic_index import SemanticIndex
from lexflow.search.semantic_index import get_semantic_index as _get_semantic_index
from lexflow.utils.config import get_settings


def get_law_registry() -> LawRegistry:
    """Dependency that provides the singleton :class:`LawRegistry`."""
    return get_registry()


# ---------------------------------------------------------------------------
# LegalGraph DI provider (issue #101).
# ---------------------------------------------------------------------------
# The graph used to live as a module-level ``_cached_graph`` inside the
# graph router with no lock and no override hook. This DI provider is the
# single source of truth: a process-wide singleton gated by
# ``_graph_lock``, swappable via ``app.dependency_overrides[get_graph]``
# in tests, and resettable via :func:`reset_graph_cache` (called by the
# sync router after a successful ``git pull``).

_graph_lock = threading.Lock()
_cached_graph: LegalGraph | None = None


def get_graph(registry: LawRegistry = Depends(get_law_registry)) -> LegalGraph:
    """Return the process-wide :class:`LegalGraph` singleton.

    First call builds the graph (or loads the disk cache via
    :func:`lexflow.graph.cache.load_or_build` so a restart doesn't
    re-parse the full corpus). Concurrent first hits are serialised by
    ``_graph_lock``; only one build runs per process.
    """
    global _cached_graph
    if _cached_graph is not None:
        return _cached_graph
    with _graph_lock:
        if _cached_graph is None:
            settings = get_settings()
            _cached_graph = _load_or_build_graph(registry, settings.data_path)
    return _cached_graph


def reset_graph_cache() -> None:
    """Drop the in-memory graph so the next request rebuilds it.

    Called by the sync router after a successful ``git pull`` on the
    legalize-es submodule — the next ``get_graph`` invocation reloads
    from the (now stale) disk cache, detects the hash mismatch, and
    rebuilds against the fresh data.
    """
    global _cached_graph
    with _graph_lock:
        _cached_graph = None


def get_search_index(registry: LawRegistry = Depends(get_law_registry)) -> SemanticIndex:
    """Provide the process-wide :class:`SemanticIndex`, building on first use.

    First call hydrates from the disk cache (via
    :func:`lexflow.search.index_cache.load_or_build`) when a matching
    corpus revision + embedder is cached, so a restart skips re-embedding
    the whole corpus; otherwise it builds and saves. Mirrors
    :func:`get_graph`: lazy, locked by the index itself, swappable via
    ``app.dependency_overrides`` in tests.
    """
    index = _get_semantic_index()
    if not index.is_built:
        settings = get_settings()
        _load_or_build_index(index, registry, settings.data_path, settings.config_dir / "index")
    return index


class PaginationParams:
    """Common pagination query parameters (#104 #8).

    Inject via ``Annotated[PaginationParams, Depends()]`` in endpoint
    signatures — mirrors the pattern already used elsewhere
    (``graph.py``, ``chat_threads.py``) so the routers look uniform.

    Implementation note: this stays as a plain class (not a Pydantic
    model) because ``from __future__ import annotations`` turns the
    enclosing module's type hints into strings, and FastAPI's string-
    based introspection currently doesn't destructure
    ``Annotated[BaseModel, Query()]`` into individual query params under
    that mode. The class form sidesteps the issue — FastAPI calls
    ``__init__`` with the resolved ``Query`` values directly.
    """

    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number"),
        page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    ) -> None:
        self.page = page
        self.page_size = page_size
