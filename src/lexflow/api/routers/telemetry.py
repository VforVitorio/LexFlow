"""``/api/v1/telemetry`` — opt-in usage telemetry (#74).

Two endpoints:

* ``GET  /telemetry/status`` — does the backend currently accept events?
* ``POST /telemetry/events`` — submit a batch (max 50) of telemetry
  records. Accepted regardless of the backend gate; persisted only
  when ``LEXFLOW_TELEMETRY_ENABLED=1``.

The SPA gates client-side too (a Zustand flag tied to a Settings
toggle), so a request only reaches this router if both the user and
the operator have opted in.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from lexflow.core.telemetry import (
    TelemetryEvent,
    TelemetryStatus,
    is_enabled,
    record_events,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

_MAX_EVENTS_PER_BATCH = 50


class TelemetryBatch(BaseModel):
    """Inbound batch shape."""

    events: list[TelemetryEvent] = Field(default_factory=list, max_length=_MAX_EVENTS_PER_BATCH)


class TelemetryIngestResponse(BaseModel):
    """Per-request ack — how many of the batch were actually persisted."""

    accepted: int
    enabled: bool


@router.get(
    "/status",
    response_model=TelemetryStatus,
    summary="Does the backend currently persist telemetry events?",
)
def get_status() -> TelemetryStatus:
    """Return the live backend opt-in state.

    The SPA reads this on boot to decide whether to show the privacy
    toggle as available — if the env knob is unset the operator hasn't
    enabled it server-side, so even an opt-in user wouldn't generate
    any events.
    """
    return TelemetryStatus(enabled=is_enabled())


@router.post(
    "/events",
    response_model=TelemetryIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a batch of telemetry events (silently dropped when disabled).",
)
def ingest_events(batch: TelemetryBatch) -> TelemetryIngestResponse:
    """Accept a batch; persist only when the backend gate is on.

    Returns 202 either way — the frontend doesn't need to branch on the
    server's gate, and we don't want telemetry firing to surface as an
    error in the UI's request log.
    """
    accepted = record_events(batch.events)
    return TelemetryIngestResponse(accepted=accepted, enabled=is_enabled())
