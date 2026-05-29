"""System endpoints — process introspection (warm-up, version, health).

Today only carries ``/system/warmup`` (#222). The conventional
``/health`` lives at the app root for compatibility with infrastructure
probes that don't know about the ``/api/v1`` prefix.
"""

from __future__ import annotations

from fastapi import APIRouter

from lexflow.api.warmup import get_warmup_state
from lexflow.core.schemas import WarmupStatusResponse

router = APIRouter(prefix="/system", tags=["System"])


@router.get(
    "/warmup",
    response_model=WarmupStatusResponse,
    summary="Background warm-up progress for the SPA to poll on startup.",
)
def get_warmup_status() -> WarmupStatusResponse:
    """Return the current snapshot of background warm-up readiness."""
    state = get_warmup_state()
    return WarmupStatusResponse(
        ready=state.ready,
        metadata_ready=state.metadata_ready,
        search_ready=state.search_ready,
        graph_ready=state.graph_ready,
        error=state.error,
        durations_seconds=state.durations_seconds,
    )
