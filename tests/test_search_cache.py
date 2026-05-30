"""Tests for the on-disk search index cache (#231)."""

from __future__ import annotations

from pathlib import Path

import pytest

from lexflow.core import search_cache as sc
from lexflow.core.corpus_revision import UNKNOWN_REVISION
from lexflow.core.search import SearchIndex


def _sample_index() -> SearchIndex:
    index = SearchIndex()
    index.add_entry("BOE-A-2000-323", "Ley de Enjuiciamiento Civil", None, "Ley de Enjuiciamiento Civil")
    index.add_entry("BOE-A-2000-323", "Ley de Enjuiciamiento Civil", "1", "Texto del artículo primero — €.")
    index.mark_built()
    return index


class _FakeRegistry:
    """Minimal stand-in exposing only the surface ``load_or_build`` touches."""

    def __init__(self) -> None:
        self.index = SearchIndex()
        self.build_calls = 0

    def ensure_search_index(self) -> None:
        self.build_calls += 1
        self.index = _sample_index()

    def export_search_index(self) -> SearchIndex:
        return self.index

    def import_search_index(self, index: SearchIndex) -> None:
        self.index = index


def test_index_to_from_dict_roundtrip() -> None:
    original = _sample_index()
    restored = SearchIndex.from_dict(original.to_dict())

    assert restored.is_built
    assert restored.entry_count == original.entry_count
    # A query that matched the source must still match after the round-trip,
    # which proves text_lower was recomputed on load.
    assert restored.search("enjuiciamiento").total == original.search("enjuiciamiento").total


def test_save_load_roundtrip(tmp_path: Path) -> None:
    cache_path = tmp_path / "search_index.json"
    sc.save_search_index(_sample_index(), cache_path, "abc123")

    loaded = sc.load_search_index(cache_path)
    assert loaded is not None
    index, data_hash = loaded
    assert data_hash == "abc123"
    assert index.entry_count == 2


def test_load_missing_returns_none(tmp_path: Path) -> None:
    assert sc.load_search_index(tmp_path / "nope.json") is None


def test_load_corrupt_returns_none(tmp_path: Path) -> None:
    cache_path = tmp_path / "search_index.json"
    cache_path.write_text("not json at all")
    assert sc.load_search_index(cache_path) is None


def test_load_version_mismatch_returns_none(tmp_path: Path) -> None:
    cache_path = tmp_path / "search_index.json"
    cache_path.write_text('{"version": "999", "hash": "x", "payload": {"entries": []}}')
    assert sc.load_search_index(cache_path) is None


def test_load_or_build_miss_then_hit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sc, "submodule_hash", lambda _p: "rev1")
    data_path = tmp_path / "legalize-es"

    first = _FakeRegistry()
    sc.load_or_build_search(first, data_path)
    assert first.build_calls == 1
    assert (tmp_path / sc.CACHE_FILENAME).exists()

    second = _FakeRegistry()
    sc.load_or_build_search(second, data_path)
    assert second.build_calls == 0  # served from disk, no rebuild
    assert second.export_search_index().entry_count == 2


def test_load_or_build_hash_change_rebuilds(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_path = tmp_path / "legalize-es"
    monkeypatch.setattr(sc, "submodule_hash", lambda _p: "rev1")
    sc.load_or_build_search(_FakeRegistry(), data_path)

    monkeypatch.setattr(sc, "submodule_hash", lambda _p: "rev2")
    rebuilt = _FakeRegistry()
    sc.load_or_build_search(rebuilt, data_path)
    assert rebuilt.build_calls == 1


def test_load_or_build_unknown_revision_bypasses(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sc, "submodule_hash", lambda _p: UNKNOWN_REVISION)
    data_path = tmp_path / "legalize-es"

    registry = _FakeRegistry()
    sc.load_or_build_search(registry, data_path)
    assert registry.build_calls == 1
    assert not (tmp_path / sc.CACHE_FILENAME).exists()
