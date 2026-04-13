"""Tests for the RAG embedding module."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from lexflow.rag.embeddings import ArticleEmbedder, EmbeddingStore, _tokenize


def test_tokenize_removes_stopwords() -> None:
    tokens = _tokenize("la ley de los derechos humanos")
    assert "la" not in tokens
    assert "derechos" in tokens
    assert "humanos" in tokens


def test_embedder_fit_transform_shape() -> None:
    corpus = ["El artículo primero establece", "La ley regula el régimen"]
    emb = ArticleEmbedder()
    vecs = emb.fit_transform(corpus)
    assert len(vecs) == 2
    assert vecs[0].shape == vecs[1].shape


def test_embedder_vector_normalised() -> None:
    emb = ArticleEmbedder()
    emb.fit(["derechos humanos libertad", "obligaciones tributarias"])
    vec = emb.transform("derechos humanos")
    assert float(np.linalg.norm(vec)) == pytest.approx(1.0, abs=1e-5)


def test_embedder_requires_fit() -> None:
    emb = ArticleEmbedder()
    with pytest.raises(RuntimeError):
        emb.transform("any text")


def test_embedding_store_search_returns_ranked() -> None:
    store = EmbeddingStore()
    emb = ArticleEmbedder()
    texts = ["derechos fundamentales", "obligaciones tributarias", "derechos del trabajador"]
    store._ids = ["a::1", "a::2", "a::3"]
    vecs = emb.fit_transform(texts)
    store._matrix = np.stack(vecs, axis=0)
    query = emb.transform("derechos")
    results = store.search(query, top_k=2)
    assert len(results) == 2
    assert results[0][1] >= results[1][1]


def test_embedding_store_save_load(tmp_path: Path) -> None:
    store = EmbeddingStore()
    emb = ArticleEmbedder()
    texts = ["ley orgánica derechos", "real decreto tributario"]
    store._ids = ["law1::1", "law2::1"]
    store._matrix = np.stack(emb.fit_transform(texts), axis=0)
    store.save(tmp_path / "idx")
    store2 = EmbeddingStore()
    assert store2.load(tmp_path / "idx")
    assert store2._ids == store._ids
