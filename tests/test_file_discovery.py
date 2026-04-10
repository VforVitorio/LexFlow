"""Tests for file discovery utilities."""

from __future__ import annotations

from pathlib import Path

from lexflow.utils.file_discovery import (
    count_law_files,
    law_id_from_path,
    list_law_directories,
    list_law_files,
    path_from_law_id,
    region_from_path,
)


def test_list_law_directories_finds_known_regions(sample_law_dir: Path) -> None:
    dirs = list_law_directories(sample_law_dir)
    names = [d.name for d in dirs]
    assert "es" in names
    assert "es-md" in names


def test_list_law_files_finds_md_files(sample_law_dir: Path) -> None:
    files = list_law_files(sample_law_dir)
    assert len(files) == 2
    assert all(f.suffix == ".md" for f in files)


def test_list_law_files_excludes_readme(sample_law_dir: Path) -> None:
    files = list_law_files(sample_law_dir)
    names = [f.name for f in files]
    assert "README.md" not in names


def test_list_law_files_filters_by_region(sample_law_dir: Path) -> None:
    files = list_law_files(sample_law_dir, region="es")
    assert len(files) == 1
    assert files[0].name == "BOE-A-2000-323.md"


def test_list_law_files_empty_for_unknown_region(sample_law_dir: Path) -> None:
    files = list_law_files(sample_law_dir, region="es-zz")
    assert files == []


def test_count_law_files(sample_law_dir: Path) -> None:
    assert count_law_files(sample_law_dir) == 2


def test_law_id_from_path() -> None:
    path = Path("data/legalize-es/es/BOE-A-1978-31229.md")
    assert law_id_from_path(path) == "BOE-A-1978-31229"


def test_region_from_path() -> None:
    path = Path("data/legalize-es/es-md/BOE-A-2018-16673.md")
    assert region_from_path(path) == "es-md"


def test_path_from_law_id_found(sample_law_dir: Path) -> None:
    result = path_from_law_id(sample_law_dir, "BOE-A-2000-323")
    assert result is not None
    assert result.name == "BOE-A-2000-323.md"


def test_path_from_law_id_not_found(sample_law_dir: Path) -> None:
    result = path_from_law_id(sample_law_dir, "BOE-A-9999-99999")
    assert result is None
