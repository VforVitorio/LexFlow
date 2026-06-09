"""Cross-encoder re-ranking of fused search hits (#43).

Rank fusion (``hybrid.py``) is cheap but coarse — it never looks at the
query and a candidate together. A cross-encoder does: it scores each
(query, passage) PAIR jointly, which is markedly more accurate but far
too slow to run over the whole corpus. So we run it only over the fused
top-K to re-order the head of the list.

Like the embedder, the heavy ``sentence-transformers`` import and the
model download are both lazy, and the backend is opt-in
(``LEXFLOW_RERANK=cross-encoder``) — default installs never pay for it.

--- WHERE TO CHANGE IF X CHANGES ---
* Default model            → :data:`DEFAULT_RERANK_MODEL`.
* Selection / opt-in        → ``search/reranker_factory.py``.
* What text gets scored     → :meth:`CrossEncoderReranker.rerank` scores
                              the snippet (cheap); switch to full article
                              text here if recall@1 needs it.
"""

from __future__ import annotations

import logging
import math
from dataclasses import replace
from pathlib import Path
from typing import TYPE_CHECKING

from lexflow.search.hybrid import HybridHit

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder

logger = logging.getLogger(__name__)

# MS-MARCO MiniLM cross-encoder: small (~80 MB), strong at passage
# re-ranking, English-trained but works acceptably on Spanish legal text.
DEFAULT_RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


class CrossEncoderReranker:
    """Re-rank fused hits with a sentence-transformers ``CrossEncoder``.

    Invariants:
    * Model load is lazy + memoised (first ``rerank`` pays the cost).
    * Only the top ``top_k`` hits are reordered; the tail is appended
      unchanged so nothing is dropped.
    * Reordered hits carry a sigmoid-squashed cross-encoder score in
      ``(0, 1)`` so the ``HybridSearchHit.score >= 0`` contract holds.
    """

    def __init__(self, model_name: str = DEFAULT_RERANK_MODEL, *, cache_folder: Path | None = None) -> None:
        self._model_name = model_name
        self._cache_folder = cache_folder
        self._model: CrossEncoder | None = None

    def _load_model(self) -> CrossEncoder:
        if self._model is None:
            from sentence_transformers import CrossEncoder

            logger.info("Loading cross-encoder model %r", self._model_name)
            cache = str(self._cache_folder) if self._cache_folder is not None else None
            try:
                self._model = CrossEncoder(self._model_name, cache_folder=cache)
            except TypeError:
                # CrossEncoder's constructor signature varies across
                # sentence-transformers versions; not all accept
                # ``cache_folder``. Fall back to the default cache location.
                self._model = CrossEncoder(self._model_name)
        return self._model

    def rerank(self, query: str, hits: list[HybridHit], *, top_k: int) -> list[HybridHit]:
        """Reorder the top ``top_k`` of ``hits`` by cross-encoder score.

        The fused tail past ``top_k`` is appended unchanged. Each reordered
        hit's ``score`` becomes ``sigmoid(cross_encoder_logit)`` so the
        wire contract (``score >= 0``) holds and the score matches the new
        order.
        """
        head = hits[:top_k]
        tail = hits[top_k:]
        if not head:
            return hits

        model = self._load_model()
        pairs = [(query, hit.snippet) for hit in head]
        raw_scores = model.predict(pairs)
        scored = [(hit, _sigmoid(float(score))) for hit, score in zip(head, raw_scores, strict=False)]
        scored.sort(key=lambda pair: -pair[1])
        reranked = [replace(hit, score=score) for hit, score in scored]
        return reranked + tail


def _sigmoid(x: float) -> float:
    """Squash a cross-encoder logit into ``(0, 1)`` for a valid wire score."""
    return 1.0 / (1.0 + math.exp(-x))
