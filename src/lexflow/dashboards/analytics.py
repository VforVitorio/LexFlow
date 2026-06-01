"""Analytical dashboards for Spanish legislation.

The four figures here share one upstream pass over the registry via
:func:`lexflow.dashboards.summary.compute_law_summary_table` (#104 #13).
A dashboard-page render calls all four; computing the summary table
once at the call site and threading it through avoids iterating the
registry four times in a row.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable

import plotly.graph_objects as go

from lexflow.core.registry import LawRegistry
from lexflow.dashboards.summary import LawSummaryRow, compute_law_summary_table


def _resolve(
    registry: LawRegistry | None,
    rows: Iterable[LawSummaryRow] | None,
) -> list[LawSummaryRow]:
    """Allow callers to pass either a registry (legacy) or pre-computed rows.

    Single-figure callers can still pass a registry and pay for one pass.
    Multi-figure pages should compute the summary once and pass it to
    each figure to amortise the work.
    """
    if rows is not None:
        return list(rows)
    if registry is not None:
        return compute_law_summary_table(registry)
    raise ValueError("Either `registry` or `rows` must be provided")


def reforms_by_year(
    registry: LawRegistry | None = None,
    *,
    rows: Iterable[LawSummaryRow] | None = None,
) -> go.Figure:
    """Bar chart: number of laws published per year."""
    table = _resolve(registry, rows)
    years = [r.publication_year for r in table if r.publication_year is not None]
    counts = Counter(years)
    sorted_years = sorted(counts)
    fig = go.Figure(go.Bar(x=sorted_years, y=[counts[y] for y in sorted_years]))
    fig.update_layout(title="Leyes por año de publicación", xaxis_title="Año", yaxis_title="Número de leyes")
    return fig


def rank_distribution(
    registry: LawRegistry | None = None,
    *,
    rows: Iterable[LawSummaryRow] | None = None,
) -> go.Figure:
    """Pie chart: distribution by LawRank."""
    table = _resolve(registry, rows)
    counts = Counter(r.rank for r in table)
    fig = go.Figure(go.Pie(labels=list(counts.keys()), values=list(counts.values())))
    fig.update_layout(title="Distribución por rango normativo")
    return fig


def status_distribution(
    registry: LawRegistry | None = None,
    *,
    rows: Iterable[LawSummaryRow] | None = None,
) -> go.Figure:
    """Bar chart: distribution by LawStatus."""
    table = _resolve(registry, rows)
    counts = Counter(r.status for r in table)
    sorted_statuses = sorted(counts)
    fig = go.Figure(go.Bar(x=sorted_statuses, y=[counts[s] for s in sorted_statuses]))
    fig.update_layout(title="Distribución por estado de vigencia", xaxis_title="Estado", yaxis_title="Número de leyes")
    return fig


def jurisdiction_heatmap(
    registry: LawRegistry | None = None,
    *,
    rows: Iterable[LawSummaryRow] | None = None,
) -> go.Figure:
    """Bar chart: laws per jurisdiction (CCAA)."""
    table = _resolve(registry, rows)
    counts = Counter(r.jurisdiction for r in table)
    sorted_jurisdictions = sorted(counts)
    fig = go.Figure(go.Bar(x=sorted_jurisdictions, y=[counts[j] for j in sorted_jurisdictions]))
    fig.update_layout(
        title="Leyes por jurisdicción (CCAA)",
        xaxis_title="Jurisdicción",
        yaxis_title="Número de leyes",
    )
    return fig
