"""Tests for the semantic-search stack (#42, #43).

Covers the three layers:
- ``HashEmbedder`` — deterministic, unit-length, dimension-stable.
- ``SemanticIndex`` — lazy build, cosine top-K, reset.
- ``GET /api/v1/laws/search/semantic`` — wire shape, query validation.

The fixture corpus is the same ``sample_law_dir`` other tests use, so
the index ends up populated with the small handful of articles that
fixture ships. Deterministic embeddings → deterministic rankings.
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_search_index
from lexflow.core.registry import LawRegistry
from lexflow.search.embeddings import DEFAULT_DIMENSION, HashEmbedder
from lexflow.search.semantic_index import SemanticIndex

# ─── Embedder ──────────────────────────────────────────────────────────


class TestHashEmbedder:
    def test_default_dimension(self) -> None:
        embedder = HashEmbedder()
        assert embedder.dimension == DEFAULT_DIMENSION
        vec = embedder.embed_one("hello")
        assert len(vec) == DEFAULT_DIMENSION

    def test_custom_dimension(self) -> None:
        embedder = HashEmbedder(dimension=64)
        vec = embedder.embed_one("hello")
        assert len(vec) == 64

    def test_invalid_dimension_rejected(self) -> None:
        with pytest.raises(ValueError):
            HashEmbedder(dimension=0)
        with pytest.raises(ValueError):
            HashEmbedder(dimension=-5)

    def test_output_is_unit_length(self) -> None:
        vec = HashEmbedder().embed_one("Spanish law on data protection")
        norm = math.sqrt(sum(x * x for x in vec))
        assert math.isclose(norm, 1.0, rel_tol=1e-6)

    def test_deterministic(self) -> None:
        a = HashEmbedder().embed_one("test text")
        b = HashEmbedder().embed_one("test text")
        assert a == b

    def test_distinct_inputs_yield_distinct_vectors(self) -> None:
        embedder = HashEmbedder()
        assert embedder.embed_one("one") != embedder.embed_one("two")

    def test_case_and_whitespace_normalised(self) -> None:
        # ``HashEmbedder`` lowercases + strips before hashing.
        embedder = HashEmbedder()
        assert embedder.embed_one("  Hello  ") == embedder.embed_one("hello")

    def test_embed_many_matches_embed_one(self) -> None:
        embedder = HashEmbedder()
        batch = embedder.embed_many(["a", "b", "c"])
        assert batch[0] == embedder.embed_one("a")
        assert batch[1] == embedder.embed_one("b")
        assert batch[2] == embedder.embed_one("c")


# ─── SemanticIndex ─────────────────────────────────────────────────────


class TestSemanticIndexBuild:
    def test_query_before_build_raises(self) -> None:
        index = SemanticIndex()
        with pytest.raises(RuntimeError):
            index.query("anything")

    def test_build_populates_records(self, mock_registry: LawRegistry) -> None:
        index = SemanticIndex()
        index.build(mock_registry)
        assert index.is_built
        assert index.row_count > 0

    def test_build_is_idempotent(self, mock_registry: LawRegistry) -> None:
        index = SemanticIndex()
        index.build(mock_registry)
        first_rows = index.row_count
        index.build(mock_registry)
        # Second build is a no-op while ``is_built`` is True; row count
        # stays the same.
        assert index.row_count == first_rows

    def test_reset_drops_rows(self, mock_registry: LawRegistry) -> None:
        index = SemanticIndex()
        index.build(mock_registry)
        assert index.is_built
        index.reset()
        assert not index.is_built
        assert index.row_count == 0


class TestSemanticIndexQuery:
    def test_returns_hits_in_descending_score(self, mock_registry: LawRegistry) -> None:
        index = SemanticIndex()
        index.build(mock_registry)
        hits = index.query("enjuiciamiento", limit=5)
        # Score order must be descending.
        scores = [h.score for h in hits]
        assert scores == sorted(scores, reverse=True)

    def test_limit_caps_output(self, mock_registry: LawRegistry) -> None:
        index = SemanticIndex()
        index.build(mock_registry)
        # The fixture has only a couple of articles; pin to limit=1.
        hits = index.query("anything", limit=1)
        assert len(hits) == 1

    def test_each_hit_carries_required_fields(self, mock_registry: LawRegistry) -> None:
        index = SemanticIndex()
        index.build(mock_registry)
        for hit in index.query("law", limit=5):
            assert hit.law_id
            assert hit.article_number
            assert hit.snippet
            assert -1.0 <= hit.score <= 1.0


# ─── HTTP endpoint ─────────────────────────────────────────────────────


@pytest.fixture()
def _isolated_index():
    """Drop the global singleton so each test starts cold."""
    from lexflow.search.semantic_index import reset_semantic_index

    reset_semantic_index()
    yield
    reset_semantic_index()
    app.dependency_overrides.pop(get_search_index, None)


class TestSemanticSearchEndpoint:
    def test_returns_object_with_query_and_items(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _isolated_index,
    ) -> None:
        response = client.get("/api/v1/laws/search/semantic", params={"q": "civil"})
        assert response.status_code == 200
        body = response.json()
        assert body["query"] == "civil"
        assert isinstance(body["items"], list)

    def test_respects_limit(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _isolated_index,
    ) -> None:
        body = client.get(
            "/api/v1/laws/search/semantic",
            params={"q": "anything", "limit": 1},
        ).json()
        assert len(body["items"]) <= 1

    def test_too_short_query_rejected(self, client: TestClient, _isolated_index) -> None:
        response = client.get("/api/v1/laws/search/semantic", params={"q": "x"})
        assert response.status_code == 422

    def test_too_large_limit_rejected(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _isolated_index,
    ) -> None:
        response = client.get(
            "/api/v1/laws/search/semantic",
            params={"q": "test", "limit": 1000},
        )
        assert response.status_code == 422

    def test_hit_fields_match_schema(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _isolated_index,
    ) -> None:
        body = client.get("/api/v1/laws/search/semantic", params={"q": "law"}).json()
        for hit in body["items"]:
            assert set(hit.keys()) >= {"law_id", "article_number", "snippet", "score"}
            assert -1.0 <= hit["score"] <= 1.0
