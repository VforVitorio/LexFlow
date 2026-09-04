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

import logging
import threading

from lexflow.core.registry import LawRegistry
from lexflow.search.index_cache import load_or_build
from lexflow.search.semantic_index import SemanticIndex, get_semantic_index
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

# Audit #871 S1.4: guards the background warm-up thread so repeated cold
# requests don't spawn duplicate builders. ``threading.Lock`` rather than
# an ``asyncio`` primitive — callers hit this from request-handling
# threads via ``get_ready_semantic_index``, never from the event loop.
_warmup_lock = threading.Lock()
_warmup_started = False


class SemanticIndexWarmingError(RuntimeError):
    """The semantic index isn't built yet; a background build was kicked off.

    Raised by :func:`get_ready_semantic_index` for request-path callers
    that must never block the event loop on a multi-minute cold embed
    pass. ``lexflow.api.error_handlers`` maps this to
    ``503 {"detail", "code": "semantic_warming"}``.
    """


def ensure_semantic_index(registry: LawRegistry) -> SemanticIndex:
    """Return the process-wide :class:`SemanticIndex`, building on first use.

    Hydrates from the disk cache when a matching corpus revision + embedder
    is present, else builds over ``registry`` and saves. A no-op once the
    singleton is already built (later callers just reuse it).

    BLOCKS until the build completes on a cold index — safe for callers
    already off the event loop (the startup warm-up task, the in-process
    MCP tool dispatched via ``asyncio.to_thread``). Request-path callers
    that run directly on the event loop (``Depends(get_search_index)``)
    must use :func:`get_ready_semantic_index` instead.
    """
    index = get_semantic_index()
    if not index.is_built:
        settings = get_settings()
        load_or_build(index, registry, settings.data_path, settings.config_dir / "index")
    return index


def get_ready_semantic_index(registry: LawRegistry) -> SemanticIndex:
    """Return the semantic index only if it is already built.

    Non-blocking counterpart to :func:`ensure_semantic_index` for the
    request path (#871 S1.4): a cold index would otherwise force a full
    corpus parse + embed pass (minutes) inline on the event loop. Instead
    this kicks a background build (at most once — repeated cold requests
    reuse the same in-flight build) and raises
    :class:`SemanticIndexWarmingError` immediately so the caller can
    respond with a retryable 503.
    """
    index = get_semantic_index()
    if index.is_built:
        return index
    _kick_background_build(registry)
    raise SemanticIndexWarmingError("Semantic index is warming up")


def _kick_background_build(registry: LawRegistry) -> None:
    """Start the background build thread, unless one is already running."""
    global _warmup_started
    with _warmup_lock:
        if _warmup_started:
            return
        _warmup_started = True
    thread = threading.Thread(
        target=_run_background_build,
        args=(registry,),
        name="semantic-index-warmup",
        daemon=True,
    )
    thread.start()


def _run_background_build(registry: LawRegistry) -> None:
    """Build the index off-thread; on failure, allow a future retry."""
    try:
        ensure_semantic_index(registry)
    except Exception:
        logger.exception("Background semantic index build failed")
        with _warmup_lock:
            global _warmup_started
            _warmup_started = False


def reset_semantic_warmup_state() -> None:
    """Drop the "build already started" flag — for tests and re-sync.

    Without this, a test (or a post-``/sync`` reset) that drops the
    index singleton via ``reset_semantic_index`` would still see
    :func:`get_ready_semantic_index` skip kicking a new build, because
    the guard flag from the PREVIOUS build would still read ``True``.
    """
    global _warmup_started
    with _warmup_lock:
        _warmup_started = False
