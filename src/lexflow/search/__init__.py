"""Semantic search + RAG infrastructure for LexFlow (#42, #43).

Public surface:

* :class:`Embedder` — abstract interface; one implementation today
  (``HashEmbedder``) keeps the package dependency-free. A real
  ``SentenceTransformerEmbedder`` swap-in is wired via the same ABC
  in a follow-up.
* :class:`SemanticIndex` — in-memory cosine-similarity index over the
  corpus's articles. Built lazily on first query.
* :func:`get_semantic_index` — process-wide singleton, mirrors the
  same DI pattern the text search + graph already use.
"""

from lexflow.search.embeddings import Embedder, HashEmbedder
from lexflow.search.semantic_index import (
    SearchHit,
    SemanticIndex,
    get_semantic_index,
    reset_semantic_index,
)

__all__ = [
    "Embedder",
    "HashEmbedder",
    "SearchHit",
    "SemanticIndex",
    "get_semantic_index",
    "reset_semantic_index",
]
