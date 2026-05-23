"""Analytical dashboards for Spanish legislation."""

from __future__ import annotations

from collections import Counter

import plotly.graph_objects as go

from lexflow.core.registry import LawRegistry


def reforms_by_year(registry: LawRegistry) -> go.Figure:
    """Bar chart: number of laws published per year."""
    years: list[int] = []
    for law_id in registry.law_ids:
        meta = registry.get_metadata(law_id)
        if meta.publication_date:
            years.append(meta.publication_date.year)
    counts = Counter(years)
    sorted_years = sorted(counts)
    fig = go.Figure(go.Bar(x=sorted_years, y=[counts[y] for y in sorted_years]))
    fig.update_layout(title="Leyes por año de publicación", xaxis_title="Año", yaxis_title="Número de leyes")
    return fig


def rank_distribution(registry: LawRegistry) -> go.Figure:
    """Pie chart: distribution by LawRank."""
    ranks: list[str] = []
    for law_id in registry.law_ids:
        meta = registry.get_metadata(law_id)
        ranks.append(meta.rank.value)
    counts = Counter(ranks)
    fig = go.Figure(go.Pie(labels=list(counts.keys()), values=list(counts.values())))
    fig.update_layout(title="Distribución por rango normativo")
    return fig


def status_distribution(registry: LawRegistry) -> go.Figure:
    """Bar chart: distribution by LawStatus."""
    statuses: list[str] = []
    for law_id in registry.law_ids:
        meta = registry.get_metadata(law_id)
        statuses.append(meta.status.value)
    counts = Counter(statuses)
    sorted_statuses = sorted(counts)
    fig = go.Figure(go.Bar(x=sorted_statuses, y=[counts[s] for s in sorted_statuses]))
    fig.update_layout(title="Distribución por estado de vigencia", xaxis_title="Estado", yaxis_title="Número de leyes")
    return fig


def jurisdiction_heatmap(registry: LawRegistry) -> go.Figure:
    """Bar chart: laws per jurisdiction (CCAA)."""
    jurisdictions: list[str] = []
    for law_id in registry.law_ids:
        meta = registry.get_metadata(law_id)
        jurisdiction_value = meta.jurisdiction.value if meta.jurisdiction else "estatal"
        jurisdictions.append(jurisdiction_value)
    counts = Counter(jurisdictions)
    sorted_jurisdictions = sorted(counts)
    fig = go.Figure(go.Bar(x=sorted_jurisdictions, y=[counts[j] for j in sorted_jurisdictions]))
    fig.update_layout(
        title="Leyes por jurisdicción (CCAA)",
        xaxis_title="Jurisdicción",
        yaxis_title="Número de leyes",
    )
    return fig
