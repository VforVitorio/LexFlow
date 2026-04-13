"""TF-IDF article embeddings with optional sentence-transformer upgrade."""

from __future__ import annotations

import json
import logging
import math
import re
from pathlib import Path
from typing import TYPE_CHECKING, cast

import numpy as np

if TYPE_CHECKING:
    from lexflow.core.registry import LawRegistry

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

_STOP_ES = frozenset(
    [
        "de",
        "la",
        "el",
        "en",
        "y",
        "a",
        "los",
        "las",
        "por",
        "con",
        "del",
        "que",
        "se",
        "un",
        "una",
        "para",
        "como",
        "al",
        "lo",
    ]
)


def _tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, remove Spanish stop-words."""
    tokens = re.findall(r"[a-záéíóúüñ]+", text.lower())
    return [t for t in tokens if t not in _STOP_ES and len(t) > 2]


# ---------------------------------------------------------------------------
# TF-IDF Embedder
# ---------------------------------------------------------------------------


class ArticleEmbedder:
    """Compute TF-IDF embeddings for law articles using numpy + scipy."""

    def __init__(self) -> None:
        self._vocab: dict[str, int] = {}
        self._idf: np.ndarray = np.array([], dtype=np.float32)
        self._fitted = False

    def fit(self, texts: list[str]) -> None:
        """Build vocabulary and IDF weights from a corpus of texts."""
        token_sets = [set(_tokenize(t)) for t in texts]
        # Build vocabulary
        vocab: dict[str, int] = {}
        for token_set in token_sets:
            for tok in token_set:
                if tok not in vocab:
                    vocab[tok] = len(vocab)
        self._vocab = vocab
        n = len(texts)
        df = np.zeros(len(vocab), dtype=np.float32)
        for token_set in token_sets:
            for tok in token_set:
                df[vocab[tok]] += 1.0
        self._idf = np.array([math.log((n + 1) / (d + 1)) + 1.0 for d in df], dtype=np.float32)
        self._fitted = True

    def transform(self, text: str) -> np.ndarray:
        """Return a normalised TF-IDF vector for *text*."""
        if not self._fitted:
            msg = "Call fit() before transform()"
            raise RuntimeError(msg)
        tokens = _tokenize(text)
        vec = np.zeros(len(self._vocab), dtype=np.float32)
        for tok in tokens:
            if tok in self._vocab:
                vec[self._vocab[tok]] += 1.0
        # TF = raw count / total tokens
        total = float(len(tokens)) if tokens else 1.0
        vec = cast(np.ndarray, (vec / total) * self._idf)
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec = cast(np.ndarray, vec / norm)
        return vec

    def fit_transform(self, texts: list[str]) -> list[np.ndarray]:
        """Fit on corpus and return vectors for all texts."""
        self.fit(texts)
        return [self.transform(t) for t in texts]


# ---------------------------------------------------------------------------
# EmbeddingStore — index + search
# ---------------------------------------------------------------------------


class EmbeddingStore:
    """Stores article embeddings and supports cosine-similarity search."""

    def __init__(self) -> None:
        self._ids: list[str] = []  # "law_id::article_number"
        self._matrix: np.ndarray | None = None

    def build(self, registry: LawRegistry, embedder: ArticleEmbedder | None = None) -> None:
        """Index all articles from the registry."""
        if embedder is None:
            embedder = ArticleEmbedder()
        ids: list[str] = []
        texts: list[str] = []
        for law_id in registry.law_ids:
            law = registry.get_law(law_id)
            for article in law.articles:
                ids.append(f"{law_id}::{article.number}")
                texts.append(f"{article.title or ''} {article.text}")
        if not texts:
            logger.warning("No articles found to index")
            return
        vectors = embedder.fit_transform(texts)
        self._ids = ids
        self._matrix = np.stack(vectors, axis=0).astype(np.float32)
        logger.info("Indexed %d article embeddings", len(ids))

    def search(self, query_vec: np.ndarray, top_k: int = 10) -> list[tuple[str, float]]:
        """Return top-k (article_id, score) pairs by cosine similarity."""
        if self._matrix is None or len(self._ids) == 0:
            return []
        scores: np.ndarray = self._matrix @ query_vec
        top_indices = np.argsort(scores)[::-1][:top_k]
        return [(self._ids[int(i)], float(scores[i])) for i in top_indices]

    def save(self, path: Path) -> None:
        """Persist the index to *path* (numpy .npy + JSON metadata)."""
        if self._matrix is None:
            return
        path.mkdir(parents=True, exist_ok=True)
        np.save(str(path / "embeddings.npy"), self._matrix)
        (path / "ids.json").write_text(json.dumps(self._ids))
        logger.info("Saved embedding index to %s", path)

    def load(self, path: Path) -> bool:
        """Load a previously saved index. Returns True on success."""
        npy_path = path / "embeddings.npy"
        ids_path = path / "ids.json"
        if not npy_path.exists() or not ids_path.exists():
            return False
        self._matrix = np.load(str(npy_path))
        self._ids = json.loads(ids_path.read_text())
        logger.info("Loaded %d embeddings from %s", len(self._ids), path)
        return True
