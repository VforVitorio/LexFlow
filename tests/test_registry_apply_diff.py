"""Tests for LawRegistry.apply_corpus_diff incremental updates (#230)."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

from lexflow.core.delta_sync import CorpusDiff
from lexflow.core.registry import LawRegistry


def _write_law(data_path: Path, law_id: str, title: str) -> None:
    """Write a minimal valid law file under ``es/`` in *data_path*."""
    frontmatter = dedent(f"""\
        title: "{title}"
        identifier: "{law_id}"
        country: "es"
        rank: "ley"
        status: "in_force"
        scope: "Estatal"
    """)
    body = f"# {title}\n\n##### Articulo 1.\n\nTexto del {law_id}.\n"
    path = data_path / "es" / f"{law_id}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{frontmatter}---\n{body}", encoding="utf-8")


def _warm_registry(data_path: Path) -> LawRegistry:
    registry = LawRegistry(data_path)
    registry.preload_all_metadata()
    registry.ensure_search_index()
    return registry


def test_add_law(tmp_path: Path) -> None:
    _write_law(tmp_path, "BOE-A-2000-1", "Ley Uno")
    registry = _warm_registry(tmp_path)
    assert not registry.has_law("BOE-A-2000-2")

    _write_law(tmp_path, "BOE-A-2000-2", "Ley Dos")
    registry.apply_corpus_diff(CorpusDiff(added=["BOE-A-2000-2"], modified=[], removed=[]))

    assert registry.has_law("BOE-A-2000-2")
    assert registry.get_metadata("BOE-A-2000-2").title == "Ley Dos"
    assert registry.search_text("Dos").total >= 1


def test_modify_law_updates_metadata_and_search(tmp_path: Path) -> None:
    _write_law(tmp_path, "BOE-A-2000-1", "Titulo Viejo")
    registry = _warm_registry(tmp_path)
    assert registry.search_text("Viejo").total >= 1

    _write_law(tmp_path, "BOE-A-2000-1", "Titulo Nuevo")
    registry.apply_corpus_diff(CorpusDiff(added=[], modified=["BOE-A-2000-1"], removed=[]))

    assert registry.get_metadata("BOE-A-2000-1").title == "Titulo Nuevo"
    assert registry.search_text("Nuevo").total >= 1
    assert registry.search_text("Viejo").total == 0  # stale entries dropped


def test_remove_law(tmp_path: Path) -> None:
    _write_law(tmp_path, "BOE-A-2000-1", "Ley Uno")
    _write_law(tmp_path, "BOE-A-2000-2", "Ley Dos")
    registry = _warm_registry(tmp_path)
    assert registry.has_law("BOE-A-2000-2")

    (tmp_path / "es" / "BOE-A-2000-2.md").unlink()
    registry.apply_corpus_diff(CorpusDiff(added=[], modified=[], removed=["BOE-A-2000-2"]))

    assert not registry.has_law("BOE-A-2000-2")
    assert registry.search_text("Dos").total == 0
    assert registry.total_count == 1


def test_empty_diff_is_noop(tmp_path: Path) -> None:
    _write_law(tmp_path, "BOE-A-2000-1", "Ley Uno")
    registry = _warm_registry(tmp_path)
    before = registry.total_count
    registry.apply_corpus_diff(CorpusDiff(added=[], modified=[], removed=[]))
    assert registry.total_count == before
