"""Pick + cache the hybrid-search re-ranker (#43).

Opt-in, mirroring ``embedder_factory``: default is **no re-ranker** (rank
fusion alone). Set ``LEXFLOW_RERANK=cross-encoder`` to re-rank the fused
top-K with a cross-encoder; if the optional ``sentence-transformers`` dep
is missing we log a warning and skip re-ranking rather than failing the
request.

The built re-ranker is a process-wide singleton so the model loads once
(lazily, on the first ``rerank``), not per request.

--- WHERE TO CHANGE IF X CHANGES ---
* New re-ranker backend     → extend :func:`build_reranker`.
* Backend / model setting    → ``utils/config.Settings`` (env
                              ``LEXFLOW_RERANK`` / ``LEXFLOW_RERANK_MODEL``).
"""

from __future__ import annotations

import logging
import threading

from lexflow.search.embedder_factory import is_sentence_transformers_available
from lexflow.search.hybrid import Reranker
from lexflow.utils.config import Settings, get_settings

logger = logging.getLogger(__name__)

CROSS_ENCODER_BACKEND = "cross-encoder"


def build_reranker(settings: Settings | None = None) -> Reranker | None:
    """Return the configured re-ranker, or ``None`` when disabled/unavailable."""
    settings = settings or get_settings()
    if settings.rerank_backend != CROSS_ENCODER_BACKEND:
        return None
    if not is_sentence_transformers_available():
        logger.warning(
            "LEXFLOW_RERANK=%s but sentence-transformers is not installed; "
            "skipping re-ranking. Install the [semantic] extra to enable it.",
            CROSS_ENCODER_BACKEND,
        )
        return None
    from lexflow.search.cross_encoder import CrossEncoderReranker

    return CrossEncoderReranker(model_name=settings.rerank_model, cache_folder=settings.config_dir / "models")


_reranker: Reranker | None = None
_reranker_built = False
_reranker_lock = threading.Lock()


def get_reranker() -> Reranker | None:
    """Process-wide re-ranker singleton (or ``None`` when disabled).

    Built once from settings; the underlying model still loads lazily on
    the first ``rerank`` call. The ``_built`` flag distinguishes "not yet
    resolved" from "resolved to None (disabled)".
    """
    global _reranker, _reranker_built
    if _reranker_built:
        return _reranker
    with _reranker_lock:
        if not _reranker_built:
            _reranker = build_reranker()
            _reranker_built = True
    return _reranker


def reset_reranker() -> None:
    """Drop the singleton — for tests + the settings-change flow."""
    global _reranker, _reranker_built
    with _reranker_lock:
        _reranker = None
        _reranker_built = False
