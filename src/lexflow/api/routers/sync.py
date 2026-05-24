"""``/api/v1/sync/*`` — legalize-es submodule sync surface (issue #86).

Two endpoints:

* ``GET  /sync/status`` — current state (last commit, upstream, behind, busy)
* ``POST /sync/run``    — kicks off a ``git pull`` in the background

The MCP / streaming surface never blocks on this — :func:`run_sync` runs
the actual pull in a worker thread via :func:`asyncio.to_thread`.

The graph keeps a process-wide cache (`graph.py:_cached_graph`). A fresh
pull invalidates it so the next request rebuilds against the new corpus.

--- WHERE TO CHANGE IF X CHANGES ---
* Sync mechanics       →  ``lexflow.sync.legalize`` (subprocess boundary).
* Add task-id tracking →  extend ``_SyncState`` + add ``GET /sync/tasks/{id}``.
* Cache invalidators   →  drop a helper into this module and chain it
                          through ``on_complete`` below.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from lexflow.api.routers import graph as graph_router_module
from lexflow.sync.legalize import SyncStatusPayload, get_sync_status, is_sync_running, run_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])


def _invalidate_graph_cache() -> None:
    """Drop the in-memory legal graph so the next request rebuilds it."""
    graph_router_module._cached_graph = None


@router.get(
    "/status",
    response_model=SyncStatusPayload,
    summary="Current sync state for the legalize-es submodule.",
)
def sync_status() -> SyncStatusPayload:
    """Return the most recent local commit + upstream gap + busy flag."""
    return get_sync_status()


@router.post(
    "/run",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a `git pull` in the background.",
)
async def trigger_sync() -> JSONResponse:
    """Start a background pull. Re-entrant: returns 409 if one is in flight."""
    if is_sync_running():
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "A sync is already in progress.", "started": False},
        )
    started = await run_sync(on_complete=_invalidate_graph_cache)
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={"detail": "Sync completed.", "started": started},
    )
