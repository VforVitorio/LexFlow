"""Tests for the fast metadata-only parser."""

from __future__ import annotations

from pathlib import Path

import pytest

from lexflow.core.metadata_parser import parse_metadata_only
from lexflow.core.parser import parse_law_file

CORPUS_PATH = Path(__file__).resolve().parent.parent / "data" / "legalize-es"
BOE_A_1968_1060 = CORPUS_PATH / "es" / "BOE-A-1968-1060.md"


def _corpus_file_or_skip(path: Path) -> Path:
    if not path.is_file():
        pytest.skip("legalize-es corpus not checked out")
    return path


def test_parse_metadata_only_reads_oversized_frontmatter() -> None:
    """Regression (#822): long references_* fields exceed the old 4 KB cap."""
    law_path = _corpus_file_or_skip(BOE_A_1968_1060)

    metadata = parse_metadata_only(law_path)
    full = parse_law_file(law_path)

    assert metadata.identifier == "BOE-A-1968-1060"
    assert metadata.identifier == full.metadata.identifier
