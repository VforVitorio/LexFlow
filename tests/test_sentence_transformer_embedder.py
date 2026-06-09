"""Tests for the real sentence-transformer embedder + backend selection (#43).

``sentence-transformers`` (torch) is intentionally NOT installed in CI, so
we inject a fake module into ``sys.modules`` and exercise the wrapper's
contract: lazy + memoised model load, L2-normalised output, batched
encode, and a real (tiny) semantic ranking through ``SemanticIndex``. The
factory tests cover the opt-in selection and the graceful fallback to
``HashEmbedder`` when the optional dependency is absent.

The fake encoder maps text onto three deterministic topic axes (data
protection / civil procedure / digital rights) so a data-protection query
genuinely out-ranks a civil-procedure article — proving the ranking math
end to end without a model download.
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
import sys
import types
from collections.abc import Iterable
from pathlib import Path
from typing import ClassVar

import numpy as np
import pytest
from pytest import MonkeyPatch

from lexflow.core.registry import LawRegistry
from lexflow.search.embeddings import HashEmbedder
from lexflow.utils.config import Settings


def _topic_vector(text: str) -> list[float]:
    """Deterministic 4-d topic embedding (NOT normalised — the wrapper is)."""
    t = text.lower()
    datos = float(t.count("datos") + t.count("proteccion") + t.count("protección"))
    civil = float(t.count("civil") + t.count("enjuiciamiento") + t.count("proceso"))
    digital = float(t.count("digital") + t.count("derechos"))
    base = 0.1  # keep every row non-zero so cosine is always defined
    return [datos + base, civil + base, digital, base]


class _FakeSentenceTransformer:
    """Stand-in for ``sentence_transformers.SentenceTransformer``."""

    instances: ClassVar[list[_FakeSentenceTransformer]] = []

    def __init__(self, model_name: str, cache_folder: str | None = None) -> None:
        self.model_name = model_name
        self.cache_folder = cache_folder
        self.encode_batches: list[list[str]] = []
        type(self).instances.append(self)

    def get_sentence_embedding_dimension(self) -> int:
        return 4

    def encode(self, texts: Iterable[str], **kwargs: object) -> np.ndarray:
        batch = list(texts)
        self.encode_batches.append(batch)
        return np.array([_topic_vector(t) for t in batch], dtype=np.float32)


@pytest.fixture()
def fake_sentence_transformers(monkeypatch: MonkeyPatch) -> type[_FakeSentenceTransformer]:
    """Inject a fake ``sentence_transformers`` module discoverable by find_spec."""
    _FakeSentenceTransformer.instances = []
    module = types.ModuleType("sentence_transformers")
    module.SentenceTransformer = _FakeSentenceTransformer  # type: ignore[attr-defined]
    module.__spec__ = importlib.machinery.ModuleSpec("sentence_transformers", loader=None)
    monkeypatch.setitem(sys.modules, "sentence_transformers", module)
    return _FakeSentenceTransformer


def _settings(backend: str, *, model: str = "test-model", config_dir: Path = Path("/tmp/lexflow")) -> Settings:
    return Settings(
        data_path=Path("/data"),
        page_size_default=20,
        page_size_max=100,
        log_level="INFO",
        config_dir=config_dir,
        telemetry_retention_days=30,
        embedder_backend=backend,
        embedder_model=model,
        rerank_backend="none",
        rerank_model="cross-encoder/ms-marco-MiniLM-L-6-v2",
    )


# ─── Wrapper contract ───────────────────────────────────────────────────


class TestSentenceTransformerEmbedder:
    def test_model_load_is_lazy_and_memoised(self, fake_sentence_transformers: type[_FakeSentenceTransformer]) -> None:
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        embedder = SentenceTransformerEmbedder("test-model", cache_folder=Path("/models"))
        # Nothing loaded at construction.
        assert fake_sentence_transformers.instances == []
        embedder.embed_one("hola")
        embedder.embed_one("mundo")
        # Exactly one model built across both calls (memoised).
        assert len(fake_sentence_transformers.instances) == 1
        loaded = fake_sentence_transformers.instances[0]
        assert loaded.model_name == "test-model"
        assert loaded.cache_folder == str(Path("/models"))

    def test_empty_batch_short_circuits_without_loading(
        self, fake_sentence_transformers: type[_FakeSentenceTransformer]
    ) -> None:
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        assert SentenceTransformerEmbedder().embed_many([]) == []
        assert fake_sentence_transformers.instances == []

    def test_output_is_unit_length(self, fake_sentence_transformers: type[_FakeSentenceTransformer]) -> None:
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        vec = SentenceTransformerEmbedder().embed_one("protección de datos")
        norm = float(np.linalg.norm(vec))
        assert norm == pytest.approx(1.0, abs=1e-6)

    def test_dimension_reported_by_model(self, fake_sentence_transformers: type[_FakeSentenceTransformer]) -> None:
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        assert SentenceTransformerEmbedder().dimension == 4

    def test_embed_many_is_one_batched_call(self, fake_sentence_transformers: type[_FakeSentenceTransformer]) -> None:
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        out = SentenceTransformerEmbedder().embed_many(["a", "b", "c"])
        assert len(out) == 3
        # One batched encode, not three per-item calls.
        assert fake_sentence_transformers.instances[0].encode_batches == [["a", "b", "c"]]


# ─── Real ranking through SemanticIndex ─────────────────────────────────


class TestSemanticRankingWithRealEmbedder:
    def test_data_protection_query_outranks_civil_articles(
        self,
        fake_sentence_transformers: type[_FakeSentenceTransformer],
        mock_registry: LawRegistry,
    ) -> None:
        from lexflow.search.semantic_index import SemanticIndex
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        index = SemanticIndex(embedder=SentenceTransformerEmbedder())
        index.build(mock_registry)
        hits = index.query("protección de datos y derechos digitales", limit=5)

        assert hits
        # The data-protection article (its body mentions "derechos
        # digitales") must rank above the civil-procedure articles.
        assert "digitales" in hits[0].snippet.lower()
        scores = [h.score for h in hits]
        assert scores == sorted(scores, reverse=True)


# ─── Backend selection ──────────────────────────────────────────────────


class TestBuildEmbedder:
    def test_default_backend_is_hash(self) -> None:
        from lexflow.search.embedder_factory import build_embedder

        assert isinstance(build_embedder(_settings("hash")), HashEmbedder)

    def test_sentence_transformers_backend_when_available(
        self, fake_sentence_transformers: type[_FakeSentenceTransformer]
    ) -> None:
        from lexflow.search.embedder_factory import build_embedder
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        embedder = build_embedder(_settings("sentence-transformers", model="my-model"))
        assert isinstance(embedder, SentenceTransformerEmbedder)
        assert embedder._model_name == "my-model"

    def test_falls_back_to_hash_when_dependency_missing(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.search import embedder_factory

        monkeypatch.setattr(importlib.util, "find_spec", lambda name: None)
        embedder = embedder_factory.build_embedder(_settings("sentence-transformers"))
        assert isinstance(embedder, HashEmbedder)
