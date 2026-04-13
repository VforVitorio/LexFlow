"""Compliance filtering and timeline dashboard."""

from __future__ import annotations

import csv
import io
from collections import Counter

import plotly.graph_objects as go
from pydantic import BaseModel

from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import LawSummary


class ComplianceFilter(BaseModel):
    """Filter criteria for compliance queries."""

    jurisdiction: str | None = None
    rank: LawRank | None = None
    status: LawStatus | None = None


def filter_laws(registry: LawRegistry, f: ComplianceFilter) -> list[LawSummary]:
    """Return laws matching the given compliance filter."""
    result = registry.list_laws(
        page=1,
        page_size=registry.total_count or 1,
        rank=f.rank,
        status=f.status,
        jurisdiction=f.jurisdiction,
    )
    return result.items


def compliance_timeline(registry: LawRegistry, f: ComplianceFilter) -> go.Figure:
    """Timeline of laws matching filter, grouped by publication year."""
    laws = filter_laws(registry, f)
    years: list[int] = []
    for law in laws:
        if law.publication_date:
            years.append(law.publication_date.year)
    counts = Counter(years)
    sorted_years = sorted(counts)
    fig = go.Figure(go.Scatter(x=sorted_years, y=[counts[y] for y in sorted_years], mode="lines+markers"))
    fig.update_layout(title="Cronología de normativa", xaxis_title="Año", yaxis_title="Normas")
    return fig


def export_csv(laws: list[LawSummary]) -> str:
    """Export list of laws as CSV string."""
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["identifier", "title", "rank", "status", "jurisdiction", "publication_date"],
    )
    writer.writeheader()
    for law in laws:
        writer.writerow(
            {
                "identifier": law.identifier,
                "title": law.title,
                "rank": law.rank.value,
                "status": law.status.value,
                "jurisdiction": law.jurisdiction or "",
                "publication_date": str(law.publication_date) if law.publication_date else "",
            }
        )
    return output.getvalue()
