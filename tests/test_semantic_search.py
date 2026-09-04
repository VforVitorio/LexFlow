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
import threading
import time

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_search_index
from lexflow.core.registry import LawRegistry
from lexflow.search.embeddings import DEFAULT_DIMENSION, HashEmbedder
from lexflow.search.semantic_index import SemanticIndex
from lexflow.search.service import ensure_semantic_index, reset_semantic_warmup_state

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
    reset_semantic_warmup_state()
    yield
    reset_semantic_index()
    reset_semantic_warmup_state()
    app.dependency_overrides.pop(get_search_index, None)


@pytest.fixture()
def _warm_index(mock_registry: LawRegistry, _isolated_index: None) -> None:
    """Pre-build the index so endpoint tests exercise the query path, not
    the cold-start 503 (#871 S1.4 — covered separately by
    ``TestSemanticSearchWarmup``).
    """
    del _isolated_index
    ensure_semantic_index(mock_registry)


class TestSemanticSearchEndpoint:
    def test_returns_object_with_query_and_items(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _warm_index: None,
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
        _warm_index: None,
    ) -> None:
        body = client.get(
            "/api/v1/laws/search/semantic",
            params={"q": "anything", "limit": 1},
        ).json()
        assert len(body["items"]) <= 1

    def test_too_short_query_rejected(self, client: TestClient, mock_registry: LawRegistry, _warm_index: None) -> None:
        response = client.get("/api/v1/laws/search/semantic", params={"q": "x"})
        assert response.status_code == 422

    def test_too_large_limit_rejected(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _warm_index: None,
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
        _warm_index: None,
    ) -> None:
        body = client.get("/api/v1/laws/search/semantic", params={"q": "law"}).json()
        for hit in body["items"]:
            assert set(hit.keys()) >= {"law_id", "article_number", "snippet", "score"}
            assert -1.0 <= hit["score"] <= 1.0


class TestSemanticSearchWarmup:
    """Cold-start 503 contract for ``Depends(get_search_index)`` (#871 S1.4)."""

    def test_cold_index_returns_503_and_kicks_background_build(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _isolated_index: None,
    ) -> None:
        del mock_registry
        response = client.get("/api/v1/laws/search/semantic", params={"q": "civil"})
        assert response.status_code == 503
        assert response.json()["code"] == "semantic_warming"

        from lexflow.search.semantic_index import get_semantic_index

        for _ in range(50):
            if get_semantic_index().is_built:
                break
            time.sleep(0.05)
        assert get_semantic_index().is_built

    def test_repeated_cold_requests_do_not_duplicate_builders(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _isolated_index: None,
    ) -> None:
        """Two near-simultaneous cold requests must share ONE background
        build, never spawn a second thread. The fixture corpus embeds fast
        enough that the second request can legitimately land AFTER the
        build finishes (200) — that race is fine; only a second builder
        thread would be the bug.
        """
        del mock_registry
        client.get("/api/v1/laws/search/semantic", params={"q": "civil"})
        client.get("/api/v1/laws/search/semantic", params={"q": "penal"})

        warmup_threads = [t for t in threading.enumerate() if t.name == "semantic-index-warmup"]
        assert len(warmup_threads) <= 1

    def test_after_build_completes_returns_200(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
        _isolated_index: None,
    ) -> None:
        from lexflow.search.semantic_index import get_semantic_index

        # Kick + wait for the background build the same way a real client
        # would after seeing the first 503.
        assert client.get("/api/v1/laws/search/semantic", params={"q": "civil"}).status_code == 503
        for _ in range(50):
            if get_semantic_index().is_built:
                break
            time.sleep(0.05)
        assert get_semantic_index().is_built

        response = client.get("/api/v1/laws/search/semantic", params={"q": "civil"})
        assert response.status_code == 200
        assert response.json()["query"] == "civil"
