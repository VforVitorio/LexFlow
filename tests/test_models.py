"""Tests for Pydantic domain models."""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from lexflow.core.enums import ConsolidationStatus, LawRank, LawStatus, Scope
from lexflow.core.models import (
    Article,
    DiffStats,
    Law,
    LawDiff,
    LawMetadata,
    LawVersion,
    Reference,
    Section,
)
from lexflow.core.schemas import LawSummary, PaginatedResponse


def test_law_metadata_from_valid_dict() -> None:
    meta = LawMetadata(
        identifier="BOE-A-2000-323",
        title="Ley 1/2000, de Enjuiciamiento Civil",
        rank=LawRank.LEY,
        status=LawStatus.IN_FORCE,
        publication_date=date(2000, 1, 8),
    )
    assert meta.identifier == "BOE-A-2000-323"
    assert meta.rank == LawRank.LEY


def test_law_metadata_defaults_for_optional_fields() -> None:
    meta = LawMetadata(identifier="BOE-A-2000-323", title="Test Law")
    assert meta.rank == LawRank.OTRO
    assert meta.status == LawStatus.IN_FORCE
    assert meta.publication_date is None
    assert meta.scope == Scope.ESTATAL
    assert meta.jurisdiction is None
    assert meta.consolidation_status == ConsolidationStatus.UNKNOWN


def test_law_metadata_rejects_missing_required() -> None:
    with pytest.raises(ValidationError):
        LawMetadata(identifier="BOE-A-2000-323")  # type: ignore[call-arg]


def test_article_number_normalization() -> None:
    article = Article(number="  Artículo 42. ", text="Some content")
    assert article.number == "42"


def test_article_number_strips_plain_number() -> None:
    article = Article(number=" 7. ", text="Some content")
    assert article.number == "7"


def test_section_recursive_structure() -> None:
    inner = Section(level=3, heading="Capitulo I", articles=[])
    outer = Section(level=2, heading="Titulo I", subsections=[inner])
    assert len(outer.subsections) == 1
    assert outer.subsections[0].heading == "Capitulo I"


def test_law_article_count_computed() -> None:
    articles = [
        Article(number="1", text="First"),
        Article(number="2", text="Second"),
    ]
    law = Law(
        metadata=LawMetadata(identifier="TEST-1", title="Test"),
        articles=articles,
        file_path="es/TEST-1.md",
    )
    assert law.article_count == 2


def test_reference_with_and_without_target_id() -> None:
    ref_with = Reference(target_id="BOE-A-2011-12345", target_text="Ley 20/2011")
    ref_without = Reference(target_text="articulo 46")
    assert ref_with.target_id == "BOE-A-2011-12345"
    assert ref_without.target_id is None


def test_paginated_response_computed_fields() -> None:
    response: PaginatedResponse[str] = PaginatedResponse(
        items=["a", "b"],
        total=10,
        page=2,
        page_size=3,
    )
    assert response.total_pages == 4
    assert response.has_next is True
    assert response.has_previous is True


def test_paginated_response_first_page() -> None:
    response: PaginatedResponse[str] = PaginatedResponse(
        items=["a"],
        total=1,
        page=1,
        page_size=20,
    )
    assert response.total_pages == 1
    assert response.has_next is False
    assert response.has_previous is False


def test_law_summary_creation() -> None:
    summary = LawSummary(
        identifier="BOE-A-2000-323",
        title="Ley 1/2000",
        rank=LawRank.LEY,
        status=LawStatus.IN_FORCE,
        publication_date=date(2000, 1, 8),
        article_count=15,
        scope=Scope.ESTATAL,
        jurisdiction=None,
    )
    assert summary.identifier == "BOE-A-2000-323"
    assert summary.article_count == 15


def test_law_version_from_data() -> None:
    version = LawVersion(
        commit_hash="abc123",
        date=date(2024, 3, 15),
        message="[reform] Ley 1/2000",
        norma="BOE-A-2024-5678",
    )
    assert version.commit_hash == "abc123"
    assert version.norma == "BOE-A-2024-5678"


def test_law_diff_stats() -> None:
    stats = DiffStats(additions=10, deletions=3, changed_articles=["1", "2"])
    diff = LawDiff(
        law_id="BOE-A-2000-323",
        from_commit="aaa",
        to_commit="bbb",
        diff_text="+new line\n-old line",
        stats=stats,
    )
    assert diff.stats.additions == 10
    assert len(diff.stats.changed_articles) == 2
