"""Pick the embedding backend for the semantic index (#43).

Default is the dependency-free :class:`HashEmbedder` so tests and
no-extra installs stay hermetic (no model download, no network). Set
``LEXFLOW_EMBEDDER=sentence-transformers`` (surfaced as Settings → Models
in the desktop app) to use the real multilingual model. If the optional
dependency isn't installed we log a warning and fall back to the hash
embedder rather than 500-ing the request — semantic search degrades to
the placeholder ranking instead of breaking.

--- WHERE TO CHANGE IF X CHANGES ---
* New backend value         → extend :func:`build_embedder` + add the
                              wrapper module.
* Backend / model setting    → ``utils/config.Settings`` (env
                              ``LEXFLOW_EMBEDDER`` / ``LEXFLOW_EMBEDDER_MODEL``).
"""

from __future__ import annotations

import importlib.util
import logging

from lexflow.search.embeddings import Embedder, HashEmbedder
from lexflow.utils.config import Settings, get_settings

logger = logging.getLogger(__name__)

SENTENCE_TRANSFORMERS_BACKEND = "sentence-transformers"


def is_sentence_transformers_available() -> bool:
    """``True`` when the optional ``sentence-transformers`` dep is importable.

    Probes via ``find_spec`` so it never triggers the heavy import — used by
    both the backend selection below and the ``/system/semantic-status``
    endpoint that drives the Settings → Models card.
    """
    return importlib.util.find_spec("sentence_transformers") is not None


def build_embedder(settings: Settings | None = None) -> Embedder:
    """Return the configured embedder, falling back to ``HashEmbedder``."""
    settings = settings or get_settings()
    if settings.embedder_backend == SENTENCE_TRANSFORMERS_BACKEND:
        return _build_sentence_transformer(settings)
    return HashEmbedder()


def _build_sentence_transformer(settings: Settings) -> Embedder:
    """Construct the real embedder, or fall back if the dep is missing.

    The wrapper imports ``sentence_transformers`` lazily (only on the
    first embed call), so we probe availability up front with
    ``find_spec`` — otherwise a missing dependency would surface as a 500
    on the first semantic query instead of a clean fallback at selection
    time.
    """
    if not is_sentence_transformers_available():
        logger.warning(
            "LEXFLOW_EMBEDDER=%s but sentence-transformers is not installed; "
            "falling back to HashEmbedder. Install the [semantic] extra to enable real semantic search.",
            SENTENCE_TRANSFORMERS_BACKEND,
        )
        return HashEmbedder()

    from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

    return SentenceTransformerEmbedder(
        model_name=settings.embedder_model,
        cache_folder=settings.config_dir / "models",
    )
