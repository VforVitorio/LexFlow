"""Tests for the opt-in cross-encoder re-ranker (#43).

``sentence-transformers`` (torch) isn't installed in CI, so we inject a
fake module exposing a ``CrossEncoder`` and exercise:

* the reranker contract — lazy/memoised load, reorder-by-score with the
  tail preserved, sigmoid-squashed scores;
* ``build_reranker`` selection + graceful skip when the dep is absent;
* ``get_reranker`` singleton caching;
* ``hybrid_search`` actually delegates to a supplied reranker.
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
import sys
import types
from collections.abc import Iterator
from pathlib import Path
from typing import ClassVar

import pytest
from pytest import MonkeyPatch

from lexflow.search.hybrid import HybridHit
from lexflow.utils.config import Settings


class _FakeCrossEncoder:
    """Stand-in for ``sentence_transformers.CrossEncoder``.

    Scores a (query, passage) pair high when the passage contains the
    query token — a deterministic, semantic-ish signal for the test.
    """

    instances: ClassVar[list[_FakeCrossEncoder]] = []

    def __init__(self, model_name: str, **kwargs: object) -> None:
        self.model_name = model_name
        self.kwargs = kwargs
        self.predict_calls: list[list[tuple[str, str]]] = []
        type(self).instances.append(self)

    def predict(self, pairs: list[tuple[str, str]]) -> list[float]:
        self.predict_calls.append(list(pairs))
        return [8.0 if query.lower() in passage.lower() else -8.0 for query, passage in pairs]


@pytest.fixture()
def fake_sentence_transformers(monkeypatch: MonkeyPatch) -> Iterator[type[_FakeCrossEncoder]]:
    _FakeCrossEncoder.instances = []
    module = types.ModuleType("sentence_transformers")
    module.CrossEncoder = _FakeCrossEncoder  # type: ignore[attr-defined]
    module.__spec__ = importlib.machinery.ModuleSpec("sentence_transformers", loader=None)
    monkeypatch.setitem(sys.modules, "sentence_transformers", module)
    yield _FakeCrossEncoder


def _hit(law_id: str, snippet: str, score: float = 0.01) -> HybridHit:
    return HybridHit(law_id=law_id, article_number="1", snippet=snippet, score=score, sources=["full_text"])


def _settings(rerank_backend: str, *, model: str = "ce-model", config_dir: Path = Path("/tmp/lexflow")) -> Settings:
    return Settings(
        data_path=Path("/data"),
        page_size_default=20,
        page_size_max=100,
        log_level="INFO",
        config_dir=config_dir,
        telemetry_retention_days=30,
        embedder_backend="hash",
        embedder_model="m",
        rerank_backend=rerank_backend,
        rerank_model=model,
    )


# ─── Reranker contract ──────────────────────────────────────────────────


class TestCrossEncoderReranker:
    def test_reorders_by_cross_encoder_score(self, fake_sentence_transformers: type[_FakeCrossEncoder]) -> None:
        del fake_sentence_transformers
        from lexflow.search.cross_encoder import CrossEncoderReranker

        hits = [
            _hit("L1", "sobre el proceso civil ordinario"),
            _hit("L2", "régimen de protección de datos personales"),
        ]
        out = CrossEncoderReranker().rerank("datos", hits, top_k=10)
        # L2 (passage contains "datos") rises to the top.
        assert [h.law_id for h in out] == ["L2", "L1"]
        # Scores are sigmoid-squashed into (0, 1), descending.
        assert 0.0 < out[1].score < out[0].score < 1.0

    def test_tail_past_top_k_is_preserved_unchanged(self, fake_sentence_transformers: type[_FakeCrossEncoder]) -> None:
        del fake_sentence_transformers
        from lexflow.search.cross_encoder import CrossEncoderReranker

        hits = [_hit("A", "datos"), _hit("B", "civil"), _hit("C", "civil")]
        out = CrossEncoderReranker().rerank("datos", hits, top_k=1)
        # Only the head (1 item) is reranked; the tail stays in place.
        assert [h.law_id for h in out] == ["A", "B", "C"]

    def test_model_load_is_lazy_and_memoised(self, fake_sentence_transformers: type[_FakeCrossEncoder]) -> None:
        from lexflow.search.cross_encoder import CrossEncoderReranker

        reranker = CrossEncoderReranker("ce-model", cache_folder=Path("/models"))
        assert fake_sentence_transformers.instances == []  # nothing loaded yet
        reranker.rerank("q", [_hit("A", "q here")], top_k=10)
        reranker.rerank("q", [_hit("B", "q again")], top_k=10)
        assert len(fake_sentence_transformers.instances) == 1
        assert fake_sentence_transformers.instances[0].model_name == "ce-model"

    def test_empty_head_returns_unchanged(self, fake_sentence_transformers: type[_FakeCrossEncoder]) -> None:
        from lexflow.search.cross_encoder import CrossEncoderReranker

        hits = [_hit("A", "x")]
        out = CrossEncoderReranker().rerank("q", hits, top_k=0)
        assert out == hits
        assert fake_sentence_transformers.instances == []  # never loaded


# ─── Backend selection ──────────────────────────────────────────────────


class TestBuildReranker:
    def test_none_backend_returns_none(self) -> None:
        from lexflow.search.reranker_factory import build_reranker

        assert build_reranker(_settings("none")) is None

    def test_cross_encoder_when_available(self, fake_sentence_transformers: type[_FakeCrossEncoder]) -> None:
        del fake_sentence_transformers
        from lexflow.search.cross_encoder import CrossEncoderReranker
        from lexflow.search.reranker_factory import build_reranker

        reranker = build_reranker(_settings("cross-encoder", model="my-ce"))
        assert isinstance(reranker, CrossEncoderReranker)
        assert reranker._model_name == "my-ce"

    def test_falls_back_to_none_when_dependency_missing(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.search import reranker_factory

        monkeypatch.setattr(importlib.util, "find_spec", lambda name: None)
        assert reranker_factory.build_reranker(_settings("cross-encoder")) is None


class TestGetRerankerSingleton:
    def test_built_once_and_resettable(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.search import reranker_factory

        reranker_factory.reset_reranker()
        calls: list[int] = []
        monkeypatch.setattr(reranker_factory, "build_reranker", lambda: (calls.append(1), None)[1])
        reranker_factory.get_reranker()
        reranker_factory.get_reranker()
        assert len(calls) == 1  # cached after first build
        reranker_factory.reset_reranker()
        reranker_factory.get_reranker()
        assert len(calls) == 2  # reset forces a rebuild
        reranker_factory.reset_reranker()


# ─── hybrid_search delegates to the reranker ────────────────────────────


class _ReverseReranker:
    def rerank(self, query: str, hits: list[HybridHit], *, top_k: int) -> list[HybridHit]:
        del query
        return list(reversed(hits[:top_k])) + hits[top_k:]


class TestHybridSearchUsesReranker:
    def test_reranker_reorders_fused_output(self) -> None:
        from lexflow.core.schemas import SearchResponse, SearchResult
        from lexflow.search.hybrid import hybrid_search

        class _Reg:
            def search_text(self, query: str, *, page: int = 1, page_size: int = 20) -> SearchResponse:
                items = [
                    SearchResult(law_id="L1", law_title="T", article_number="1", snippet="a", score=3.0),
                    SearchResult(law_id="L2", law_title="T", article_number="2", snippet="b", score=2.0),
                ]
                return SearchResponse(query=query, total=2, items=items, page=page, page_size=page_size)

        class _Sem:
            def query(self, query: str, *, limit: int = 10):  # type: ignore[no-untyped-def]
                return []

        without = hybrid_search(_Reg(), _Sem(), "q", limit=10)
        with_rr = hybrid_search(_Reg(), _Sem(), "q", limit=10, reranker=_ReverseReranker())
        assert [h.law_id for h in with_rr] == list(reversed([h.law_id for h in without]))
