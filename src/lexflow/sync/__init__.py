"""Sync surface — keeps the legalize-es submodule fresh (issue #86)."""

from lexflow.sync.legalize import (
    SyncStatusPayload,
    get_sync_status,
    is_sync_running,
    run_sync,
)

__all__ = [
    "SyncStatusPayload",
    "get_sync_status",
    "is_sync_running",
    "run_sync",
]
