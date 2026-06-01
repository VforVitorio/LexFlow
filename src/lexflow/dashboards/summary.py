"""One-pass tabular summary of the law registry (#104 #13).

The Plotly figures in :mod:`lexflow.dashboards.analytics` used to iterate
the registry four times, once per chart. Each pass was cheap individually
(``get_metadata`` is cached) but the duplication made every new chart
copy the iteration boilerplate. This module collapses the four passes
into one.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new column        → extend :class:`LawSummaryRow` + the loop in
                            :func:`compute_law_summary_table`.
* Reuse in a new figure   → import from this module instead of writing
                            another ``for law_id in registry.law_ids``
                            loop.
"""

from __future__ import annotations

from dataclasses import dataclass

from lexflow.core.registry import LawRegistry


@dataclass(frozen=True)
class LawSummaryRow:
    """One row per law — the projection the analytics figures consume."""

    law_id: str
    rank: str
    status: str
    jurisdiction: str
    publication_year: int | None


def compute_law_summary_table(registry: LawRegistry) -> list[LawSummaryRow]:
    """Project the registry into one flat row per law.

    Single iteration over ``registry.law_ids``; downstream consumers
    (``reforms_by_year``, ``rank_distribution``, ``status_distribution``,
    ``jurisdiction_heatmap``) read the dimensions they care about
    without touching the registry themselves.
    """
    rows: list[LawSummaryRow] = []
    for law_id in registry.law_ids:
        meta = registry.get_metadata(law_id)
        rows.append(
            LawSummaryRow(
                law_id=law_id,
                rank=meta.rank.value,
                status=meta.status.value,
                jurisdiction=meta.jurisdiction.value if meta.jurisdiction else "estatal",
                publication_year=meta.publication_date.year if meta.publication_date else None,
            )
        )
    return rows
