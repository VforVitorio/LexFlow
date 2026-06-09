"""Tests for hybrid (RRF) search — full-text + semantic fusion (#43).

Two layers:

* ``hybrid_search`` fusion math, driven by crafted full-text + semantic
  ranked lists (duck-typed fakes) so the RRF behaviour is deterministic
  and independent of any embedder:
    - a document found by BOTH rankers outranks one found by only one;
    - a semantic-only hit near the top still beats a weak full-text hit
      (the recall win that motivates fusion);
    - snippet/source bookkeeping is correct.
* ``GET /api/v1/laws/search/hybrid`` wire shape + query validation,
  exercised over the small fixture corpus.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_search_index
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import SearchResponse, SearchResult
from lexflow.search.hybrid import FULL_TEXT_SOURCE, SEMANTIC_SOURCE, hybrid_search
from lexflow.search.semantic_index import SearchHit


class _FakeRegistry:
    """Duck-typed stand-in exposing only ``search_text``."""

    def __init__(self, items: list[SearchResult]) -> None:
        self._items = items

    def search_text(self, query: str, *, page: int = 1, page_size: int = 20) -> SearchResponse:
        return SearchResponse(query=query, total=len(self._items), items=self._items, page=page, page_size=page_size)


class _FakeSemanticIndex:
    """Duck-typed stand-in exposing only ``query``."""

    def __init__(self, hits: list[SearchHit]) -> None:
        self._hits = hits

    def query(self, query: str, *, limit: int = 10) -> list[SearchHit]:
        return self._hits[:limit]


def _ft(law_id: str, article: str | None, score: float) -> SearchResult:
    return SearchResult(
        law_id=law_id,
        law_title="T",
        article_number=article,
        snippet=f"ft:{law_id}:{article}",
        score=score,
    )


def _sem(law_id: str, article: str, score: float) -> SearchHit:
    return SearchHit(law_id=law_id, article_number=article, snippet=f"sem:{law_id}:{article}", score=score)


def _run(full_text: list[SearchResult], semantic: list[SearchHit], *, limit: int = 10):  # type: ignore[no-untyped-def]
    return hybrid_search(_FakeRegistry(full_text), _FakeSemanticIndex(semantic), "q", limit=limit)


# ─── Fusion math ────────────────────────────────────────────────────────


class TestRrfFusion:
    def test_found_by_both_ranks_first(self) -> None:
        full_text = [_ft("L1", "1", 5.0), _ft("L2", "2", 3.0)]
        semantic = [_sem("L2", "2", 0.9), _sem("L3", "3", 0.8)]
        hits = _run(full_text, semantic)
        # L2 (found by both) wins; then full-text rank-0 L1; then semantic L3.
        assert [h.law_id for h in hits] == ["L2", "L1", "L3"]
        assert hits[0].sources == [FULL_TEXT_SOURCE, SEMANTIC_SOURCE]
        # Full-text snippet wins when a doc is found by both.
        assert hits[0].snippet == "ft:L2:2"

    def test_semantic_only_hit_beats_weak_full_text_hit(self) -> None:
        # A doc found ONLY by semantic at rank 0 must beat one found ONLY
        # by full-text at rank 5 — the recall win fusion exists for.
        full_text = [_ft(f"F{i}", str(i), float(10 - i)) for i in range(6)]  # F0..F5
        semantic = [_sem("S0", "0", 0.95)]
        hits = _run(full_text, semantic)
        order = [h.law_id for h in hits]
        assert order.index("S0") < order.index("F5")

    def test_title_level_full_text_hit_is_its_own_bucket(self) -> None:
        # article_number=None (a law-title match) must NOT fuse with a
        # semantic hit on a real article of the same law.
        full_text = [_ft("L1", None, 9.0)]
        semantic = [_sem("L1", "1", 0.9)]
        hits = _run(full_text, semantic)
        assert len(hits) == 2
        keys = {(h.law_id, h.article_number) for h in hits}
        assert keys == {("L1", None), ("L1", "1")}

    def test_semantic_only_hit_keeps_semantic_snippet_and_source(self) -> None:
        hits = _run([], [_sem("S1", "1", 0.7)])
        assert len(hits) == 1
        assert hits[0].sources == [SEMANTIC_SOURCE]
        assert hits[0].snippet == "sem:S1:1"

    def test_limit_caps_output(self) -> None:
        full_text = [_ft(f"L{i}", str(i), 1.0) for i in range(20)]
        hits = _run(full_text, [], limit=5)
        assert len(hits) == 5

    def test_empty_inputs_return_empty(self) -> None:
        assert _run([], []) == []

    def test_scores_descending(self) -> None:
        full_text = [_ft("L1", "1", 5.0), _ft("L2", "2", 3.0)]
        semantic = [_sem("L2", "2", 0.9), _sem("L3", "3", 0.8)]
        scores = [h.score for h in _run(full_text, semantic)]
        assert scores == sorted(scores, reverse=True)


# ─── HTTP endpoint ──────────────────────────────────────────────────────


@pytest.fixture()
def _isolated_index() -> Iterator[None]:
    """Reset the semantic singleton so each test rebuilds from the fixture."""
    from lexflow.search.semantic_index import reset_semantic_index

    reset_semantic_index()
    yield
    reset_semantic_index()
    app.dependency_overrides.pop(get_search_index, None)


class TestHybridSearchEndpoint:
    def test_returns_query_and_items(
        self, client: TestClient, mock_registry: LawRegistry, _isolated_index: None
    ) -> None:
        response = client.get("/api/v1/laws/search/hybrid", params={"q": "civil"})
        assert response.status_code == 200
        body = response.json()
        assert body["query"] == "civil"
        assert isinstance(body["items"], list)

    def test_hit_fields_match_schema(
        self, client: TestClient, mock_registry: LawRegistry, _isolated_index: None
    ) -> None:
        body = client.get("/api/v1/laws/search/hybrid", params={"q": "civil"}).json()
        for hit in body["items"]:
            assert set(hit.keys()) >= {"law_id", "article_number", "snippet", "score", "sources"}
            assert hit["score"] >= 0.0
            assert set(hit["sources"]) <= {"full_text", "semantic"}
            assert hit["sources"]

    def test_too_short_query_rejected(
        self, client: TestClient, mock_registry: LawRegistry, _isolated_index: None
    ) -> None:
        # mock_registry keeps the search-index dependency on the tiny fixture
        # corpus (FastAPI resolves it before raising the 422), so this stays
        # fast + hermetic instead of building the real legalize-es index.
        del mock_registry
        assert client.get("/api/v1/laws/search/hybrid", params={"q": "x"}).status_code == 422

    def test_too_large_limit_rejected(
        self, client: TestClient, mock_registry: LawRegistry, _isolated_index: None
    ) -> None:
        response = client.get("/api/v1/laws/search/hybrid", params={"q": "civil", "limit": 1000})
        assert response.status_code == 422
