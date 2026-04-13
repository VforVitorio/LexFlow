"""Tests for analytics and compliance dashboards."""

from __future__ import annotations

from pathlib import Path

import plotly.graph_objects as go

from lexflow.core.registry import LawRegistry
from lexflow.dashboards.analytics import rank_distribution, reforms_by_year, status_distribution
from lexflow.dashboards.compliance import ComplianceFilter, export_csv, filter_laws

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _registry(sample_law_dir: Path) -> LawRegistry:
    """Build a LawRegistry backed by the sample_law_dir fixture."""
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    return registry


# ---------------------------------------------------------------------------
# Analytics tests
# ---------------------------------------------------------------------------


def test_reforms_by_year_returns_figure(sample_law_dir: Path) -> None:
    fig = reforms_by_year(_registry(sample_law_dir))
    assert isinstance(fig, go.Figure)
    assert len(fig.data) > 0


def test_rank_distribution_returns_figure(sample_law_dir: Path) -> None:
    fig = rank_distribution(_registry(sample_law_dir))
    assert isinstance(fig, go.Figure)
    assert len(fig.data) > 0


def test_status_distribution_returns_figure(sample_law_dir: Path) -> None:
    fig = status_distribution(_registry(sample_law_dir))
    assert isinstance(fig, go.Figure)


# ---------------------------------------------------------------------------
# Compliance tests
# ---------------------------------------------------------------------------


def test_compliance_filter_by_jurisdiction(sample_law_dir: Path) -> None:
    registry = _registry(sample_law_dir)
    f = ComplianceFilter(jurisdiction="es-md")
    laws = filter_laws(registry, f)
    assert all(law.jurisdiction == "es-md" for law in laws)


def test_compliance_filter_no_filter_returns_all(sample_law_dir: Path) -> None:
    registry = _registry(sample_law_dir)
    laws = filter_laws(registry, ComplianceFilter())
    assert len(laws) == registry.total_count


def test_export_csv_has_headers(sample_law_dir: Path) -> None:
    registry = _registry(sample_law_dir)
    laws = filter_laws(registry, ComplianceFilter())[:5]
    csv_str = export_csv(laws)
    assert "identifier" in csv_str
    assert "title" in csv_str


def test_export_csv_has_correct_row_count(sample_law_dir: Path) -> None:
    registry = _registry(sample_law_dir)
    all_laws = filter_laws(registry, ComplianceFilter())
    sample = all_laws[:2]
    csv_str = export_csv(sample)
    lines = [line for line in csv_str.strip().splitlines() if line]
    assert len(lines) == len(sample) + 1  # header + data rows
