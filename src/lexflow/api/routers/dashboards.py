"""``GET /api/v1/dashboards/{preset}`` — KPI cards + main chart (issue #85).

Two presets today: ``compliance`` and ``analytics``. Both share the
"laws per year" series (so the SPA's main chart stays consistent across
tabs); the KPI cards differ — compliance leans into status distribution,
analytics leans into volume / pace.

The payload shape matches the frontend's ``DashboardData`` interface
(``frontend/src/lib/types.ts``). Snake-case on the wire, the
``api.ts`` transformer flips it to camelCase.

--- WHERE TO CHANGE IF X CHANGES ---
* Data shape    →  ``lexflow.dashboards.data`` (DashboardPayload).
* Add a preset  →  extend ``build_dashboard_payload`` + the
                   ``Path(..., pattern=...)`` regex below.
* Filters       →  add Query params here and thread them through the
                   data assemblers; not in scope for this PR.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path

from lexflow.api.dependencies import get_law_registry
from lexflow.core.registry import LawRegistry
from lexflow.dashboards.data import DashboardPayload, build_dashboard_payload

# Sprint 6 api-8: keep the preset names + the route pattern in lock-step.
# ``DashboardPreset`` is the type the route exposes (so the generated TS
# client gets a discriminated union), while ``_PRESET_PATTERN`` enforces
# the same set at the path level. Adding a preset means extending both.
DashboardPreset = Literal["compliance", "analytics"]
_PRESET_PATTERN = "^(compliance|analytics)$"

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])


@router.get(
    "/{preset}",
    response_model=DashboardPayload,
    summary="Aggregated dashboard data (KPI cards + main series).",
)
def get_dashboard(
    preset: Annotated[DashboardPreset, Path(pattern=_PRESET_PATTERN)],
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
) -> DashboardPayload:
    """Return the KPI cards + main chart series for the requested preset."""
    try:
        return build_dashboard_payload(registry, preset)
    except ValueError as exc:
        # Belt-and-braces — the path regex already filters to the two
        # known presets, so this branch is reached only if a future
        # change adds a preset to the regex without wiring its assembler.
        raise HTTPException(status_code=404, detail=str(exc)) from exc
