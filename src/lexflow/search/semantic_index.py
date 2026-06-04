"""In-memory cosine-similarity index over the corpus's articles (#43).

Build once from the live :class:`LawRegistry`, query by free-text. The
real value of the index comes when a real embedder is wired in (a
follow-up of #42); the structure here keeps the rest of the stack
moving in the meantime.

Storage shape
-------------

Two parallel arrays:

* ``_vectors`` — ``numpy.ndarray`` of shape ``(N, D)``, L2-normalised
  per row. Cosine similarity collapses to a single ``matmul`` + ``argpartition``
  thanks to the unit-length rows.
* ``_records`` — list of ``IndexRecord``, one per row. Holds the
  metadata the API needs to render a hit (law id, article number,
  snippet).

The whole thing lives in RAM. At ~12 K articles x 384 floats x 4
bytes = ~18 MB, it's not worth persisting to disk yet (the graph
cache exists for a similar reason but PageRank is more expensive to
recompute than 12 K hash-embeddings). Persistence is a follow-up.

--- WHERE TO CHANGE IF X CHANGES ---
* Swap embedder backend             → ``SemanticIndex(embedder=...)``.
* Persistence to disk               → mirror ``graph/cache.py`` shape;
                                       key the file by corpus revision.
* Hybrid (text + semantic) ranking  → add a ``HybridIndex`` that
                                       combines ``LawRegistry.search_text``
                                       with ``SemanticIndex.query``.
                                       Out of scope for the first PR.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

import numpy as np

from lexflow.core.exceptions import LawNotFoundError
from lexflow.core.registry import LawRegistry
from lexflow.search.embeddings import Embedder, HashEmbedder

logger = logging.getLogger(__name__)

# Trim each article's body to this many characters before we embed and
# before we slice a snippet to send back. Bigger windows give the
# embedder more context but blow up memory; this is the sweet spot for
# typical Spanish law articles (rarely more than ~500-800 chars).
_EMBED_CHAR_BUDGET = 800
_SNIPPET_CHARS = 220


@dataclass(frozen=True)
class IndexRecord:
    """Per-row metadata kept alongside the vector.

    Stays separate from :class:`SearchHit` because the index has no
    business carrying the score (recomputed per query) but the record
    must persist with the vector.
    """

    law_id: str
    article_number: str
    snippet: str


@dataclass(frozen=True)
class SearchHit:
    """One row of a semantic-search response."""

    law_id: str
    article_number: str
    snippet: str
    score: float


class SemanticIndex:
    """Cosine-similarity index over a registry's articles.

    Lazy: ``build`` is called automatically by ``query`` the first time
    it runs. Subsequent queries reuse the cached vectors. Call
    :meth:`reset` if the registry changes mid-process (e.g. after
    ``sync.py`` updates the corpus).
    """

    def __init__(self, *, embedder: Embedder | None = None) -> None:
        self._embedder = embedder or HashEmbedder()
        self._vectors: np.ndarray | None = None
        self._records: list[IndexRecord] = []
        self._build_lock = threading.Lock()

    @property
    def is_built(self) -> bool:
        return self._vectors is not None

    @property
    def row_count(self) -> int:
        return len(self._records)

    def reset(self) -> None:
        """Drop every cached vector + record. Next query will rebuild."""
        with self._build_lock:
            self._vectors = None
            self._records = []

    def build(self, registry: LawRegistry) -> None:
        """Embed every article in ``registry`` and store the matrix.

        Concurrent callers are serialised: the second arrival blocks
        on the build lock and finds the matrix already populated when
        it wakes up. Cheap relative to the embed cost.
        """
        with self._build_lock:
            if self._vectors is not None:
                return
            records: list[IndexRecord] = []
            texts: list[str] = []
            for law_id in registry.law_ids:
                try:
                    law = registry.get_law(law_id)
                except (LawNotFoundError, OSError, ValueError):
                    logger.warning("Could not load %s for semantic index", repr(law_id), exc_info=True)
                    continue
                for article in law.articles:
                    text = article.text[:_EMBED_CHAR_BUDGET]
                    if not text.strip():
                        continue
                    records.append(
                        IndexRecord(
                            law_id=law_id,
                            article_number=article.number,
                            snippet=_make_snippet(article.text),
                        )
                    )
                    texts.append(text)
            if not records:
                # Empty corpus → still flip ``is_built`` so we don't
                # keep retrying. ``query`` early-returns on an empty matrix.
                self._vectors = np.zeros((0, self._embedder.dimension), dtype=np.float32)
                self._records = []
                return
            raw = self._embedder.embed_many(texts)
            matrix = np.asarray(raw, dtype=np.float32)
            self._vectors = matrix
            self._records = records
            logger.info("Semantic index built: %d articles, dim=%d", len(records), self._embedder.dimension)

    def query(self, text: str, *, limit: int = 10) -> list[SearchHit]:
        """Return the top-``limit`` hits ranked by cosine similarity.

        The empty index returns an empty list; that lets the caller
        skip a branch and just iterate the response.
        """
        if not self.is_built:
            raise RuntimeError("SemanticIndex.query called before build")
        if self._vectors is None or self._vectors.shape[0] == 0:
            return []
        q_raw = np.asarray(self._embedder.embed_one(text), dtype=np.float32)
        # The embedder already L2-normalises per row, so the cosine
        # similarity collapses to a single matmul.
        scores = self._vectors @ q_raw
        top_k = min(limit, scores.shape[0])
        # ``argpartition`` picks the top-K in O(N); we then sort just
        # that slice for the descending-by-score order the API needs.
        top_idx = np.argpartition(scores, -top_k)[-top_k:]
        ordered = top_idx[np.argsort(-scores[top_idx])]
        return [
            SearchHit(
                law_id=self._records[i].law_id,
                article_number=self._records[i].article_number,
                snippet=self._records[i].snippet,
                score=float(scores[i]),
            )
            for i in ordered
        ]


def _make_snippet(text: str) -> str:
    """Trim an article body to a fixed-size snippet for the API response."""
    stripped = text.strip()
    if len(stripped) <= _SNIPPET_CHARS:
        return stripped
    return stripped[: _SNIPPET_CHARS - 1].rstrip() + "…"


_index: SemanticIndex | None = None
_index_lock = threading.Lock()


def get_semantic_index() -> SemanticIndex:
    """Process-wide singleton, lazily constructed.

    Mirrors the same DI shape as ``get_graph`` / ``get_registry`` so
    tests can swap it via ``app.dependency_overrides`` (see the API
    router for the wiring).
    """
    global _index
    if _index is None:
        with _index_lock:
            if _index is None:
                _index = SemanticIndex()
    return _index


def reset_semantic_index() -> None:
    """Drop the singleton — for tests + the sync flow."""
    global _index
    with _index_lock:
        if _index is not None:
            _index.reset()
        _index = None
