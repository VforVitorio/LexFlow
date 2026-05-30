"""Tests for the on-disk metadata cache (#231)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from lexflow.core import metadata_cache as mc
from lexflow.core.corpus_revision import UNKNOWN_REVISION
from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.models import LawMetadata


def _sample_metadata() -> dict[str, LawMetadata]:
    return {
        "BOE-A-2000-323": LawMetadata(
            identifier="BOE-A-2000-323",
            title="Ley 1/2000 de Enjuiciamiento Civil",
            rank=LawRank.LEY,
            status=LawStatus.IN_FORCE,
            publication_date=date(2000, 1, 8),
            tags=["derecho-procesal", "civil"],
            category="procesal",
        ),
        "BOE-A-2018-16673": LawMetadata(
            identifier="BOE-A-2018-16673",
            title="Ley Orgánica 3/2018 de Protección de Datos — €uro test",
        ),
    }


class _FakeRegistry:
    """Minimal stand-in exposing only the surface ``load_or_preload`` touches."""

    def __init__(self) -> None:
        self.metadata: dict[str, LawMetadata] = {}
        self.preload_calls = 0

    def preload_all_metadata(self) -> None:
        self.preload_calls += 1
        self.metadata = _sample_metadata()

    def export_metadata(self) -> dict[str, LawMetadata]:
        return dict(self.metadata)

    def import_metadata(self, metadata: dict[str, LawMetadata]) -> None:
        self.metadata.update(metadata)


def test_save_load_roundtrip(tmp_path: Path) -> None:
    cache_path = tmp_path / "metadata_cache.json"
    original = _sample_metadata()

    mc.save_metadata_cache(original, cache_path, "abc123")
    loaded = mc.load_metadata_cache(cache_path)

    assert loaded is not None
    metadata, data_hash = loaded
    assert data_hash == "abc123"
    assert metadata == original  # frozen pydantic models compare by value


def test_load_missing_returns_none(tmp_path: Path) -> None:
    assert mc.load_metadata_cache(tmp_path / "nope.json") is None


def test_load_corrupt_returns_none(tmp_path: Path) -> None:
    cache_path = tmp_path / "metadata_cache.json"
    cache_path.write_text("{ this is not json")
    assert mc.load_metadata_cache(cache_path) is None


def test_load_version_mismatch_returns_none(tmp_path: Path) -> None:
    cache_path = tmp_path / "metadata_cache.json"
    cache_path.write_text('{"version": "999", "hash": "x", "payload": {}}')
    assert mc.load_metadata_cache(cache_path) is None


def test_load_or_preload_miss_then_hit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "submodule_hash", lambda _p: "rev1")
    data_path = tmp_path / "legalize-es"  # parent (tmp_path) holds the cache file

    first = _FakeRegistry()
    mc.load_or_preload_metadata(first, data_path)
    assert first.preload_calls == 1
    assert (tmp_path / mc.CACHE_FILENAME).exists()

    second = _FakeRegistry()
    mc.load_or_preload_metadata(second, data_path)
    assert second.preload_calls == 0  # served from disk, no reparse
    assert second.export_metadata() == first.export_metadata()


def test_load_or_preload_hash_change_rebuilds(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_path = tmp_path / "legalize-es"
    monkeypatch.setattr(mc, "submodule_hash", lambda _p: "rev1")
    mc.load_or_preload_metadata(_FakeRegistry(), data_path)

    monkeypatch.setattr(mc, "submodule_hash", lambda _p: "rev2")
    rebuilt = _FakeRegistry()
    mc.load_or_preload_metadata(rebuilt, data_path)
    assert rebuilt.preload_calls == 1  # stale cache ignored


def test_load_or_preload_unknown_revision_bypasses(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "submodule_hash", lambda _p: UNKNOWN_REVISION)
    data_path = tmp_path / "legalize-es"

    registry = _FakeRegistry()
    mc.load_or_preload_metadata(registry, data_path)
    assert registry.preload_calls == 1
    assert not (tmp_path / mc.CACHE_FILENAME).exists()  # never persisted while blind
