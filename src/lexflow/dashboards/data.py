"""Aggregated dashboard data — the JSON shape served by ``/api/v1/dashboards``.

The :mod:`lexflow.dashboards.analytics` and :mod:`lexflow.dashboards.compliance`
modules already compute Plotly figures. Those are great for the standalone
dashboard renderer (#37) but pushing a full Plotly figure spec to the
browser is heavier than needed when the React SPA already knows how to
draw a small bar chart from a flat ``{labels, values}`` series.

This module computes the same underlying numbers and packages them as a
:class:`DashboardPayload` matching the frontend's ``DashboardData`` type
(see ``frontend/src/lib/types.ts``).

--- WHERE TO CHANGE IF X CHANGES ---
* Add a card                 → extend the ``_compliance_cards`` /
                               ``_analytics_cards`` helpers below.
* Tweak series window        → ``_SERIES_WINDOW_YEARS``.
* Frontend payload shape     → keep this module in sync with the
                               matching transformer in ``api.ts`` and the
                               ``DashboardData`` interface in ``types.ts``.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from lexflow.core.enums import LawStatus
from lexflow.core.registry import LawRegistry

# How many recent years to expose in the main series + sparklines. The
# SPA renders a 12-bucket chart by default; 12 keeps the response small
# and matches the visual.
_SERIES_WINDOW_YEARS = 12

# Within the series, the last N buckets get the "recent" highlight on
# the SPA chart (amber instead of indigo). Mirrors the mock dashboard's
# treatment so the live data feels familiar.
_RECENT_HIGHLIGHT_BUCKETS = 4


class MetricCardPayload(BaseModel):
    """Single KPI tile rendered above the main chart on the SPA."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    value: str
    delta: str
    spark: list[float] = Field(default_factory=list)
    positive: bool | None = None


class DashboardSeries(BaseModel):
    """The main chart's data: parallel arrays + a recent highlight cut."""

    labels: list[str]
    values: list[float]
    recent_from: int | None = None


class DashboardPayload(BaseModel):
    """Full response of ``GET /api/v1/dashboards/{preset}``."""

    preset: str
    cards: list[MetricCardPayload]
    series: DashboardSeries


# ---------------------------------------------------------------------------
# Helpers — pull primitive shapes out of the registry once per request.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _CorpusAggregate:
    """Single-pass aggregate of the corpus metadata used by the dashboards.

    Audit #409 perf: each call to ``/dashboards/<preset>`` used to walk
    the 12 k-law metadata cache 3-4 times (publication years twice,
    status counts, rank counts). One pass + a small dataclass keeps the
    helpers below cheap to call independently.
    """

    publication_years: list[int]
    status_counts: Counter[LawStatus]
    rank_counts: Counter[str]


def _aggregate_corpus(registry: LawRegistry) -> _CorpusAggregate:
    """Walk the metadata cache exactly once and accumulate everything."""
    years: list[int] = []
    statuses: Counter[LawStatus] = Counter()
    ranks: Counter[str] = Counter()
    for law_id in registry.law_ids:
        meta = registry.get_metadata(law_id)
        if meta.publication_date:
            years.append(meta.publication_date.year)
        statuses[meta.status] += 1
        ranks[meta.rank.value] += 1
    return _CorpusAggregate(publication_years=years, status_counts=statuses, rank_counts=ranks)


def _series_window(years: Iterable[int]) -> DashboardSeries:
    """Bucket a year list into the last ``_SERIES_WINDOW_YEARS`` buckets.

    If the registry has fewer years than the window, we still emit one
    bucket per observed year — empty padding would be confusing.
    """
    counts = Counter(years)
    if not counts:
        return DashboardSeries(labels=[], values=[], recent_from=None)
    today_year = date.today().year
    start = today_year - _SERIES_WINDOW_YEARS + 1
    sorted_years = [y for y in range(start, today_year + 1) if y in counts]
    if not sorted_years:
        # Registry has data older than the window — fall back to the
        # most recent N buckets it actually contains rather than 12
        # empty ones.
        sorted_years = sorted(counts)[-_SERIES_WINDOW_YEARS:]
    values = [float(counts[y]) for y in sorted_years]
    recent = max(0, len(values) - _RECENT_HIGHLIGHT_BUCKETS)
    return DashboardSeries(
        labels=[str(y) for y in sorted_years],
        values=values,
        recent_from=recent if values else None,
    )


def _spark_tail(values: list[float]) -> list[float]:
    """Return a copy of the series values trimmed to the sparkline length.

    Sharing the same data across cards keeps the response honest — these
    are real series, not mocked noise. The SPA scales each sparkline to
    its own min/max so visually distinct cards still read as distinct.
    """
    return list(values[-_SERIES_WINDOW_YEARS:])


# ---------------------------------------------------------------------------
# Preset assemblers
# ---------------------------------------------------------------------------


def _compliance_cards(aggregate: _CorpusAggregate, spark: list[float]) -> list[MetricCardPayload]:
    """Compliance preset: 3 cards anchored on the status distribution."""
    counts = aggregate.status_counts
    # LawStatus values, per ``src/lexflow/core/enums.py``: in_force,
    # repealed, partially_repealed, pending. We map "modificada" to the
    # partially-repealed bucket since the SPA uses three logical statuses
    # (vigente / modificada / derogada) and partial-repeal is the
    # closest match to "amended".
    vigente = counts.get(LawStatus.IN_FORCE, 0)
    modificada = counts.get(LawStatus.PARTIALLY_REPEALED, 0)
    derogada = counts.get(LawStatus.REPEALED, 0)
    total = sum(counts.values()) or 1
    return [
        MetricCardPayload(
            id="vigentes",
            title="Normas vigentes",
            value=str(vigente),
            delta=f"{round(vigente / total * 100)}%",
            spark=spark,
            positive=True,
        ),
        MetricCardPayload(
            id="modificadas",
            title="Modificadas",
            value=str(modificada),
            delta=f"{round(modificada / total * 100)}%",
            spark=spark,
            positive=None,
        ),
        MetricCardPayload(
            id="derogadas",
            title="Derogadas",
            value=str(derogada),
            delta=f"{round(derogada / total * 100)}%",
            spark=spark,
            positive=False,
        ),
    ]


def _analytics_cards(registry: LawRegistry, aggregate: _CorpusAggregate, spark: list[float]) -> list[MetricCardPayload]:
    """Analytics preset: 3 cards on volume + reform pace."""
    total = registry.total_count or len(aggregate.publication_years)
    years = aggregate.publication_years
    avg_per_year = round(sum(spark) / len(spark), 1) if spark else 0.0
    rank_count = aggregate.rank_counts
    top_rank, top_n = rank_count.most_common(1)[0] if rank_count else ("—", 0)
    return [
        MetricCardPayload(
            id="total",
            title="Total de normas",
            value=str(total),
            delta=f"{len(set(years))} años",
            spark=spark,
            positive=True,
        ),
        MetricCardPayload(
            id="ritmo",
            title="Ritmo de reformas",
            value=str(avg_per_year),
            delta="por año",
            spark=spark,
            positive=None,
        ),
        MetricCardPayload(
            id="top_rango",
            title=f"Top rango: {top_rank}",
            value=str(top_n),
            delta=f"{round(top_n / max(1, total) * 100)}%",
            spark=spark,
            positive=True,
        ),
    ]


def build_dashboard_payload(registry: LawRegistry, preset: str) -> DashboardPayload:
    """Build the full :class:`DashboardPayload` for a preset.

    Both presets share the "reforms by year" series — the difference
    is in the KPI cards. That deliberately keeps the API small and the
    chart consistent between tabs.

    Raises :class:`ValueError` for unknown preset names; the router maps
    that to a 404.
    """
    aggregate = _aggregate_corpus(registry)
    series = _series_window(aggregate.publication_years)
    spark = _spark_tail(series.values)
    if preset == "compliance":
        cards = _compliance_cards(aggregate, spark)
    elif preset == "analytics":
        cards = _analytics_cards(registry, aggregate, spark)
    else:
        raise ValueError(f"Unknown dashboard preset: {preset!r}")
    return DashboardPayload(preset=preset, cards=cards, series=series)
