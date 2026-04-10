"""Utilities for discovering and listing law files in the legalize-es data directory."""

from __future__ import annotations

from pathlib import Path

LAW_FILE_SUFFIX: str = ".md"

EXCLUDED_FILENAMES: frozenset[str] = frozenset(
    {
        "README.md",
        "CHANGELOG.md",
        "LICENSE.md",
        "CONTRIBUTING.md",
    }
)

KNOWN_REGIONS: tuple[str, ...] = (
    "es",
    "es-an",
    "es-ar",
    "es-as",
    "es-cb",
    "es-ce",
    "es-cl",
    "es-cm",
    "es-cn",
    "es-ct",
    "es-ex",
    "es-ga",
    "es-ib",
    "es-mc",
    "es-md",
    "es-ml",
    "es-nc",
    "es-pv",
    "es-ri",
    "es-vc",
)


def list_law_directories(data_path: Path) -> list[Path]:
    """Return sorted list of region directories that exist under *data_path*."""
    return sorted(data_path / region for region in KNOWN_REGIONS if (data_path / region).is_dir())


def _is_law_file(path: Path) -> bool:
    """Return True if *path* looks like a law Markdown file."""
    return path.suffix == LAW_FILE_SUFFIX and path.name not in EXCLUDED_FILENAMES and path.is_file()


def list_law_files(data_path: Path, *, region: str | None = None) -> list[Path]:
    """Return sorted list of all .md law files.

    When *region* is given (e.g. ``"es"`` or ``"es-md"``), only files inside
    that region directory are returned.
    """
    if region is not None:
        search_root = data_path / region
        if not search_root.is_dir():
            return []
        return sorted(p for p in search_root.iterdir() if _is_law_file(p))

    results: list[Path] = []
    for directory in list_law_directories(data_path):
        results.extend(p for p in directory.iterdir() if _is_law_file(p))
    return sorted(results)


def count_law_files(data_path: Path) -> int:
    """Return total number of law files without building the full list."""
    total = 0
    for directory in list_law_directories(data_path):
        total += sum(1 for p in directory.iterdir() if _is_law_file(p))
    return total


def law_id_from_path(file_path: Path) -> str:
    """Extract the law identifier from a file path.

    >>> law_id_from_path(Path("data/legalize-es/es/BOE-A-1978-31229.md"))
    'BOE-A-1978-31229'
    """
    return file_path.stem


def region_from_path(file_path: Path) -> str:
    """Extract the region code from a file path.

    >>> region_from_path(Path("data/legalize-es/es-md/BOE-A-2018-16673.md"))
    'es-md'
    """
    return file_path.parent.name


def path_from_law_id(data_path: Path, law_id: str) -> Path | None:
    """Locate the .md file for a given law identifier.

    Searches across all region directories. Returns ``None`` if not found.
    """
    filename = f"{law_id}{LAW_FILE_SUFFIX}"
    for directory in list_law_directories(data_path):
        candidate = directory / filename
        if candidate.is_file():
            return candidate
    return None
