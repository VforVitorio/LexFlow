"""Tests for the semantic-index disk cache (#43 follow-up).

Covers the round-trip (save → load restores vectors + records), the three
invalidation keys (corpus revision, embedder identity, schema version),
corrupt-cache tolerance, and the ``load_or_build`` orchestration: cache
hit skips the embed pass, a changed key forces a rebuild, and an unknown
corpus revision bypasses the cache entirely.

``submodule_hash`` is monkeypatched per test so the corpus revision is
deterministic without needing a real git checkout.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pytest import MonkeyPatch

from lexflow.core.corpus_revision import UNKNOWN_REVISION
from lexflow.core.registry import LawRegistry
from lexflow.search import index_cache
from lexflow.search.embeddings import HashEmbedder
from lexflow.search.semantic_index import SemanticIndex


class _CountingEmbedder(HashEmbedder):
    """HashEmbedder that records how many times the corpus is embedded."""

    def __init__(self, dimension: int = 8) -> None:
        super().__init__(dimension)
        self.embed_many_calls = 0

    def embed_many(self, texts: object) -> list[list[float]]:  # type: ignore[override]
        self.embed_many_calls += 1
        return super().embed_many(texts)  # type: ignore[arg-type]


def _built_index(registry: LawRegistry, *, dimension: int = 8) -> SemanticIndex:
    index = SemanticIndex(embedder=HashEmbedder(dimension))
    index.build(registry)
    return index


# ─── Embedder identity (cache key) ──────────────────────────────────────


class TestEmbedderIdentity:
    def test_hash_identity_encodes_dimension(self) -> None:
        assert HashEmbedder(384).identity == "hash:384"
        assert HashEmbedder(64).identity == "hash:64"

    def test_sentence_transformer_identity_needs_no_model_load(self) -> None:
        # ``identity`` must be computable without the heavy model load, so
        # the cache can validate a persisted index up front.
        from lexflow.search.sentence_transformer_embedder import SentenceTransformerEmbedder

        assert SentenceTransformerEmbedder("some-model").identity == "st:some-model"


# ─── save / load round-trip ─────────────────────────────────────────────


class TestSaveLoadRoundTrip:
    def test_round_trip_restores_rows_and_ranking(self, mock_registry: LawRegistry, tmp_path: Path) -> None:
        cache_dir = tmp_path / "index"
        original = _built_index(mock_registry)
        index_cache.save_index(original, cache_dir, corpus_hash="rev1", embedder_id="hash:8")

        restored = SemanticIndex(embedder=HashEmbedder(8))
        assert index_cache.load_index(restored, cache_dir, expected_hash="rev1", expected_embedder="hash:8")
        assert restored.row_count == original.row_count
        before = [h.law_id for h in original.query("civil", limit=5)]
        after = [h.law_id for h in restored.query("civil", limit=5)]
        assert after == before

    def test_load_missing_cache_returns_false(self, tmp_path: Path) -> None:
        index = SemanticIndex(embedder=HashEmbedder(8))
        assert not index_cache.load_index(index, tmp_path / "absent", expected_hash="x", expected_embedder="hash:8")
        assert not index.is_built

    def test_round_trip_preserves_non_cp1252_snippets(self, tmp_path: Path) -> None:
        """Regression: real legalize-es snippets carry chars outside Windows'
        cp1252 codepage (Catalan ŀ, the "…" truncation marker). ``write_text``
        defaults to the locale encoding, so the cache MUST pin utf-8 — else
        ``save_index`` raises ``UnicodeEncodeError`` on Windows and the
        endpoint 500s. Built from injected records so it stays fast + hermetic.
        """
        import numpy as np

        from lexflow.search.semantic_index import IndexRecord

        cache_dir = tmp_path / "index"
        tricky = "drets digitals de la ciutadania (l·l) — secció 3…"
        index = SemanticIndex(embedder=HashEmbedder(4))
        index.hydrate(
            np.array([[1.0, 0.0, 0.0, 0.0]], dtype=np.float32),
            [IndexRecord(law_id="LAW-1", article_number="1", snippet=tricky)],
        )
        index_cache.save_index(index, cache_dir, corpus_hash="rev1", embedder_id="hash:4")

        restored = SemanticIndex(embedder=HashEmbedder(4))
        assert index_cache.load_index(restored, cache_dir, expected_hash="rev1", expected_embedder="hash:4")
        assert restored.query("anything", limit=1)[0].snippet == tricky


# ─── invalidation ───────────────────────────────────────────────────────


class TestCacheInvalidation:
    def _save(self, registry: LawRegistry, cache_dir: Path) -> None:
        index_cache.save_index(_built_index(registry), cache_dir, corpus_hash="rev1", embedder_id="hash:8")

    def test_corpus_hash_mismatch_returns_false(self, mock_registry: LawRegistry, tmp_path: Path) -> None:
        cache_dir = tmp_path / "index"
        self._save(mock_registry, cache_dir)
        fresh = SemanticIndex(embedder=HashEmbedder(8))
        assert not index_cache.load_index(fresh, cache_dir, expected_hash="rev2", expected_embedder="hash:8")

    def test_embedder_mismatch_returns_false(self, mock_registry: LawRegistry, tmp_path: Path) -> None:
        cache_dir = tmp_path / "index"
        self._save(mock_registry, cache_dir)
        fresh = SemanticIndex(embedder=HashEmbedder(8))
        assert not index_cache.load_index(fresh, cache_dir, expected_hash="rev1", expected_embedder="st:model")

    def test_version_mismatch_returns_false(self, mock_registry: LawRegistry, tmp_path: Path) -> None:
        cache_dir = tmp_path / "index"
        self._save(mock_registry, cache_dir)
        # Rewrite meta with a stale schema version.
        meta_path = cache_dir / "index_meta.json"
        import json

        meta = json.loads(meta_path.read_text())
        meta["version"] = "0"
        meta_path.write_text(json.dumps(meta))
        fresh = SemanticIndex(embedder=HashEmbedder(8))
        assert not index_cache.load_index(fresh, cache_dir, expected_hash="rev1", expected_embedder="hash:8")

    def test_corrupt_cache_returns_false(self, tmp_path: Path) -> None:
        cache_dir = tmp_path / "index"
        cache_dir.mkdir()
        (cache_dir / "vectors.npy").write_bytes(b"not a real npy")
        (cache_dir / "index_meta.json").write_text("{ broken")
        index = SemanticIndex(embedder=HashEmbedder(8))
        assert not index_cache.load_index(index, cache_dir, expected_hash="rev1", expected_embedder="hash:8")


# ─── load_or_build orchestration ────────────────────────────────────────


class TestLoadOrBuild:
    def test_cache_hit_skips_rebuild(
        self, mock_registry: LawRegistry, tmp_path: Path, monkeypatch: MonkeyPatch
    ) -> None:
        monkeypatch.setattr(index_cache, "submodule_hash", lambda _p: "rev1")
        cache_dir = tmp_path / "index"

        first = SemanticIndex(embedder=_CountingEmbedder())
        index_cache.load_or_build(first, mock_registry, Path("/data"), cache_dir)
        embedder = first._embedder
        assert isinstance(embedder, _CountingEmbedder)
        assert embedder.embed_many_calls == 1
        assert (cache_dir / "vectors.npy").exists()

        second_embedder = _CountingEmbedder()
        second = SemanticIndex(embedder=second_embedder)
        index_cache.load_or_build(second, mock_registry, Path("/data"), cache_dir)
        # Hydrated from cache — the corpus was NOT re-embedded.
        assert second_embedder.embed_many_calls == 0
        assert second.row_count == first.row_count

    def test_corpus_change_forces_rebuild(
        self, mock_registry: LawRegistry, tmp_path: Path, monkeypatch: MonkeyPatch
    ) -> None:
        cache_dir = tmp_path / "index"
        monkeypatch.setattr(index_cache, "submodule_hash", lambda _p: "rev1")
        index_cache.load_or_build(SemanticIndex(embedder=HashEmbedder(8)), mock_registry, Path("/d"), cache_dir)

        monkeypatch.setattr(index_cache, "submodule_hash", lambda _p: "rev2")
        rebuilt_embedder = _CountingEmbedder()
        index_cache.load_or_build(SemanticIndex(embedder=rebuilt_embedder), mock_registry, Path("/d"), cache_dir)
        assert rebuilt_embedder.embed_many_calls == 1

    def test_embedder_change_forces_rebuild(
        self, mock_registry: LawRegistry, tmp_path: Path, monkeypatch: MonkeyPatch
    ) -> None:
        cache_dir = tmp_path / "index"
        monkeypatch.setattr(index_cache, "submodule_hash", lambda _p: "rev1")
        index_cache.load_or_build(SemanticIndex(embedder=HashEmbedder(8)), mock_registry, Path("/d"), cache_dir)

        # dim 16 → identity "hash:16" ≠ cached "hash:8" → rebuild.
        rebuilt_embedder = _CountingEmbedder(16)
        index_cache.load_or_build(SemanticIndex(embedder=rebuilt_embedder), mock_registry, Path("/d"), cache_dir)
        assert rebuilt_embedder.embed_many_calls == 1

    def test_unknown_revision_bypasses_cache(
        self, mock_registry: LawRegistry, tmp_path: Path, monkeypatch: MonkeyPatch
    ) -> None:
        monkeypatch.setattr(index_cache, "submodule_hash", lambda _p: UNKNOWN_REVISION)
        cache_dir = tmp_path / "index"
        index = SemanticIndex(embedder=HashEmbedder(8))
        index_cache.load_or_build(index, mock_registry, Path("/d"), cache_dir)
        assert index.is_built
        # Nothing persisted — an unknown revision would never invalidate.
        assert not (cache_dir / "vectors.npy").exists()


@pytest.mark.usefixtures("mock_registry")
def test_load_or_build_writes_then_reads_real_query(
    mock_registry: LawRegistry, tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    """End-to-end: build+save, then a fresh hydrated index answers a query."""
    monkeypatch.setattr(index_cache, "submodule_hash", lambda _p: "rev1")
    cache_dir = tmp_path / "index"
    index_cache.load_or_build(SemanticIndex(embedder=HashEmbedder(8)), mock_registry, Path("/d"), cache_dir)

    fresh = SemanticIndex(embedder=HashEmbedder(8))
    index_cache.load_or_build(fresh, mock_registry, Path("/d"), cache_dir)
    hits = fresh.query("civil", limit=3)
    assert hits
    assert all(h.law_id and h.article_number for h in hits)
