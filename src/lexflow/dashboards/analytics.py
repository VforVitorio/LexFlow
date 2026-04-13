"""Analytics dashboard figures built with Plotly."""

from __future__ import annotations

from collections import Counter

import plotly.graph_objects as go

from lexflow.core.registry import LawRegistry


def reforms_by_year(registry: LawRegistry) -> go.Figure:
    """Bar chart: number of laws published per year."""
    years: Counter[str] = Counter()
    for law_id in registry.law_ids:
        try:
            meta = registry.get_metadata(law_id)
            if meta.publication_date:
                years[str(meta.publication_date.year)] += 1
        except Exception:
            pass

    sorted_years = sorted(years.keys())
    counts = [years[y] for y in sorted_years]

    fig = go.Figure(data=[go.Bar(x=sorted_years, y=counts)])
    fig.update_layout(title="Reforms by Year", xaxis_title="Year", yaxis_title="Count")
    return fig


def rank_distribution(registry: LawRegistry) -> go.Figure:
    """Pie chart: distribution of laws by rank."""
    ranks: Counter[str] = Counter()
    for law_id in registry.law_ids:
        try:
            meta = registry.get_metadata(law_id)
            ranks[meta.rank.value] += 1
        except Exception:
            pass

    fig = go.Figure(data=[go.Pie(labels=list(ranks.keys()), values=list(ranks.values()))])
    fig.update_layout(title="Rank Distribution")
    return fig


def status_distribution(registry: LawRegistry) -> go.Figure:
    """Bar chart: distribution of laws by enforcement status."""
    statuses: Counter[str] = Counter()
    for law_id in registry.law_ids:
        try:
            meta = registry.get_metadata(law_id)
            statuses[meta.status.value] += 1
        except Exception:
            pass

    fig = go.Figure(data=[go.Bar(x=list(statuses.keys()), y=list(statuses.values()))])
    fig.update_layout(title="Status Distribution", xaxis_title="Status", yaxis_title="Count")
    return fig


def jurisdiction_heatmap(registry: LawRegistry) -> go.Figure:
    """Bar chart: number of laws per jurisdiction."""
    jurisdictions: Counter[str] = Counter()
    for law_id in registry.law_ids:
        try:
            meta = registry.get_metadata(law_id)
            key = meta.jurisdiction.value if meta.jurisdiction else "unknown"
            jurisdictions[key] += 1
        except Exception:
            pass

    sorted_juris = sorted(jurisdictions.keys())
    counts = [jurisdictions[j] for j in sorted_juris]

    fig = go.Figure(data=[go.Bar(x=sorted_juris, y=counts)])
    fig.update_layout(title="Laws by Jurisdiction", xaxis_title="Jurisdiction", yaxis_title="Count")
    return fig
