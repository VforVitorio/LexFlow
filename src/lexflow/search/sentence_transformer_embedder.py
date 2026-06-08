"""Real multilingual sentence-embedding backend (#43).

Wraps ``sentence-transformers`` behind the :class:`Embedder` contract so
the semantic index ranks by meaning instead of the placeholder
``HashEmbedder``. Both the heavy dependency (torch + transformers) and the
model download are **lazy**: importing this module is cheap, and the model
is only fetched + loaded on the first ``embed_*`` call. That keeps the
import dependency-light for installs that never enable semantic search,
and lets the embedder be constructed (and the index singleton wired) with
no up-front cost.

Model files cache under ``<config_dir>/models`` (default
``~/.lexflow/models``) so a restart reuses the download.

--- WHERE TO CHANGE IF X CHANGES ---
* Default model            → :data:`DEFAULT_MODEL`. Keep it 384-dim to
                             match the rest of the index, or revisit
                             ``embeddings.DEFAULT_DIMENSION`` consumers.
* Where the model caches    → ``cache_folder`` arg (``config_dir/models``).
* Backend selection / fallback → ``search/embedder_factory.py``.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from pathlib import Path
from typing import TYPE_CHECKING, cast

import numpy as np

from lexflow.search.embeddings import Embedder

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# Multilingual MiniLM: 384-dim (matches ``embeddings.DEFAULT_DIMENSION``),
# ~120 MB, covers Spanish + ~50 languages. A solid default for Spanish
# legal text without a Spanish-only download.
DEFAULT_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"


class SentenceTransformerEmbedder(Embedder):
    """Dense multilingual embedder backed by ``sentence-transformers``.

    Invariants:
    * Output rows are L2-normalised — the cosine index relies on it.
    * Model load is lazy + memoised: the first ``embed_*`` call pays the
      download/load cost, later calls reuse the in-memory model.
    * Deterministic for a fixed model + input, so the index cache (a
      follow-up) can trust persisted vectors across restarts.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL, *, cache_folder: Path | None = None) -> None:
        self._model_name = model_name
        self._cache_folder = cache_folder
        self._model: SentenceTransformer | None = None

    def _load_model(self) -> SentenceTransformer:
        """Import the library + load the model on first use (memoised).

        The ``sentence_transformers`` import lives here, not at module
        top, so this module stays importable — and mockable in tests —
        without the heavy optional dependency installed.
        """
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            cache = str(self._cache_folder) if self._cache_folder is not None else None
            logger.info("Loading sentence-transformer model %r (cache=%s)", self._model_name, cache)
            self._model = SentenceTransformer(self._model_name, cache_folder=cache)
        return self._model

    @property
    def dimension(self) -> int:
        model = self._load_model()
        dim = model.get_sentence_embedding_dimension()
        # The SDK types this Optional; a loaded model always reports a
        # concrete dim, but fall back to the known default so the index
        # never sees ``None``.
        return int(dim) if dim is not None else 384

    @property
    def identity(self) -> str:
        # Model name alone pins the vector space — computable without
        # loading the model, so the index cache can validate a persisted
        # index without paying the download/load cost.
        return f"st:{self._model_name}"

    def embed_one(self, text: str) -> list[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: Iterable[str]) -> list[list[float]]:
        batch = list(texts)
        if not batch:
            return []
        model = self._load_model()
        raw = model.encode(batch, convert_to_numpy=True, show_progress_bar=False)
        matrix = np.asarray(raw, dtype=np.float32)
        normalised = _l2_normalise_rows(matrix)
        # ``ndarray.tolist`` is typed ``Any``; the float32 matrix yields a
        # plain nested float list, so the cast states the real shape.
        return cast(list[list[float]], normalised.tolist())


def _l2_normalise_rows(matrix: np.ndarray) -> np.ndarray:
    """Scale each row to unit length so cosine collapses to a dot product.

    We normalise here rather than via the SDK's ``normalize_embeddings``
    flag so the invariant holds regardless of library version. A degenerate
    zero-norm row is left as zeros (divide-by-zero guarded) — a zero vector
    scores 0 against everything, the sensible "no signal" outcome.
    """
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    safe_norms = np.where(norms == 0.0, 1.0, norms)
    return matrix / safe_norms
