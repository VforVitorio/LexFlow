"""Build-or-reuse helper for the process-wide semantic index.

Both the FastAPI dependency (``api/dependencies.get_search_index``) and the
in-process MCP tool (``chat/mcp_server.search_semantic_top_k``) need the
same thing: the singleton :class:`SemanticIndex`, built — and disk-cached
— on first use. This is the single source of truth so the two callers
can't drift on how the index is warmed.

Lives in its own module (not ``semantic_index``) to avoid an import cycle:
``index_cache`` imports ``semantic_index``, so ``semantic_index`` cannot
import ``index_cache`` back.
"""

from __future__ import annotations

from lexflow.core.registry import LawRegistry
from lexflow.search.index_cache import load_or_build
from lexflow.search.semantic_index import SemanticIndex, get_semantic_index
from lexflow.utils.config import get_settings


def ensure_semantic_index(registry: LawRegistry) -> SemanticIndex:
    """Return the process-wide :class:`SemanticIndex`, building on first use.

    Hydrates from the disk cache when a matching corpus revision + embedder
    is present, else builds over ``registry`` and saves. A no-op once the
    singleton is already built (later callers just reuse it).
    """
    index = get_semantic_index()
    if not index.is_built:
        settings = get_settings()
        load_or_build(index, registry, settings.data_path, settings.config_dir / "index")
    return index
