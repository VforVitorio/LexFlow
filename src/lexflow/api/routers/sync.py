"""Sync endpoint: pull latest legalize-es and refresh state incrementally.

``POST /api/v1/sync`` runs ``git pull`` on the legalize-es submodule, then
patches the in-memory registry, search index and graph for just the laws that
changed (#230) and rewrites the on-disk caches. If the diff can't be trusted
(git failure, or a change touching thousands of laws) it falls back to dropping
the caches so the next request rebuilds wholesale.

Threadpool footprint (Sprint 5 rf-4): this handler is sync ``def`` so FastAPI
runs it in its threadpool, but it does two heavy things back-to-back —
``git pull`` (≤120s subprocess) AND a potential full graph rebuild via
``get_graph(registry)`` after a fallback. Concurrent sync calls block other
sync-handler requests; we accept that today because (a) sync is a privileged
single-user operation and (b) moving it to ``BackgroundTasks`` would require a
client-polled job-id contract this product doesn't yet need.
"""

from __future__ import annotations

import logging
import subprocess
import threading
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from lexflow.api.dependencies import get_graph, reset_graph_cache
from lexflow.core.corpus_revision import submodule_hash
from lexflow.core.delta_sync import CorpusDiff, diff_corpus_since
from lexflow.core.metadata_cache import CACHE_FILENAME as METADATA_CACHE_FILENAME
from lexflow.core.metadata_cache import save_metadata_cache
from lexflow.core.registry import LawRegistry, get_registry
from lexflow.core.search_cache import CACHE_FILENAME as SEARCH_CACHE_FILENAME
from lexflow.core.search_cache import save_search_index
from lexflow.graph.builder import apply_diff_to_graph
from lexflow.graph.cache import save_graph
from lexflow.search.semantic_index import reset_semantic_index
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Sync"])

GRAPH_CACHE_FILENAME = "graph_cache.json"

# Audit #409 — concurrency guard. ``POST /sync`` can run up to 120 s of
# subprocess + a potential full graph rebuild; without a gate the SPA
# (or an attacker) can stack overlapping calls that block every other
# sync-class request and burn CPU+I/O. The lock is acquired in
# non-blocking mode; a second request gets 429 immediately. Same
# pattern reused for ``/mcp/bundles`` size-limited upload guard at the
# router level.
_SYNC_IN_FLIGHT = threading.Lock()
_LAST_SYNC: dict[str, str | int | None] = {"finished_at": None, "mode": None}


class SyncStatusResponse(BaseModel):
    """Wire shape for ``GET /sync/status``."""

    in_flight: bool
    last_finished_at: str | None
    last_mode: str | None


def _run_sync(response: Response) -> dict[str, str | int]:
    """Inner sync routine. Caller must hold ``_SYNC_IN_FLIGHT``."""
    settings = get_settings()
    data_path = settings.data_path
    registry = get_registry()

    before_commit = submodule_hash(data_path)
    output = _git_pull(str(data_path))
    after_commit = submodule_hash(data_path)

    if before_commit == after_commit and before_commit != "unknown":
        return {"status": "ok", "mode": "noop", "output": output}

    # State changed → 201 + Location pointing at the corpus revision.
    response.status_code = 201
    response.headers["Location"] = f"/api/v1/system/whats-new?since={before_commit}"

    diff = diff_corpus_since(data_path, before_commit)
    if diff is None:
        _fallback_rebuild()
        return {"status": "ok", "mode": "rebuild", "output": output}

    _apply_incremental(registry, diff, after_commit)
    return {
        "status": "ok",
        "mode": "incremental",
        "output": output,
        "added": len(diff.added),
        "modified": len(diff.modified),
        "removed": len(diff.removed),
    }


def _gated_sync(response: Response) -> dict[str, str | int]:
    """Acquire the in-flight lock or 429, then run the sync routine."""
    if not _SYNC_IN_FLIGHT.acquire(blocking=False):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "sync_in_flight",
                "message": "Another sync is already running. Wait for it to finish before triggering a new one.",
            },
        )
    result: dict[str, str | int] | None = None
    try:
        result = _run_sync(response)
        return result
    finally:
        _LAST_SYNC["finished_at"] = datetime.now(UTC).isoformat()
        mode_value = result.get("mode") if isinstance(result, dict) else None
        _LAST_SYNC["mode"] = mode_value if isinstance(mode_value, str) else None
        _SYNC_IN_FLIGHT.release()


@router.post("")
def sync_corpus(response: Response) -> dict[str, str | int]:
    """Pull the latest legalize-es revision and refresh state.

    Sprint 5 api-1: returns ``200 OK`` only for the ``noop`` mode (the
    corpus was already at HEAD). Modes that actually mutate state
    (``incremental``, ``rebuild``) return ``201 Created`` with a
    ``Location`` header pointing at the resulting revision. This lets
    cache-friendly clients tell "nothing happened" from "you changed the
    world" without parsing the body.

    Audit #409: serialised behind ``_SYNC_IN_FLIGHT``; overlapping
    requests are rejected with 429.
    """
    return _gated_sync(response)


@router.post("/run", summary="SPA alias for `POST /sync` (#465).")
def sync_run_alias(response: Response) -> dict[str, str | int]:
    """SPA-facing alias for ``POST /sync``.

    The SPA's Datos tab and the HomePage banner used to call
    ``POST /sync/run`` and ``GET /sync/status``, but the backend only
    exposed bare ``POST /sync``. Adding the alias keeps the SPA path
    contract stable without breaking external callers of the canonical
    ``POST /sync``.
    """
    return _gated_sync(response)


@router.get("/status", response_model=SyncStatusResponse, summary="In-flight + last-run state (#465).")
def sync_status() -> SyncStatusResponse:
    """Return whether a sync is running and metadata about the last one."""
    last_finished = _LAST_SYNC["finished_at"]
    last_mode = _LAST_SYNC["mode"]
    return SyncStatusResponse(
        in_flight=_SYNC_IN_FLIGHT.locked(),
        last_finished_at=last_finished if isinstance(last_finished, str) else None,
        last_mode=last_mode if isinstance(last_mode, str) else None,
    )


def _git_pull(data_path: str) -> str:
    """Run ``git pull --ff-only`` in the submodule, raising HTTP errors.

    Sprint 5 api-2: stderr from a failed ``git pull`` may contain
    credentials, remote URLs or paths the operator doesn't want a client
    to see. We log it server-side and return a generic 502 with a stable
    ``code`` so the SPA can render a deterministic message without
    parsing free-form text.
    """
    try:
        result = subprocess.run(
            ["git", "-C", data_path, "pull", "--ff-only"],
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as exc:
        logger.error("git pull failed (stderr=%r)", exc.stderr)
        raise HTTPException(
            status_code=502,
            detail={"code": "sync_upstream_failed", "message": "Upstream sync failed"},
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=504,
            detail={"code": "sync_upstream_timeout", "message": "Upstream sync timed out"},
        ) from exc
    return result.stdout.strip() or "Already up to date."


def _apply_incremental(registry: LawRegistry, diff: CorpusDiff, new_commit: str) -> None:
    """Patch registry + graph for *diff* and rewrite all three on-disk caches."""
    registry.apply_corpus_diff(diff)
    graph = get_graph(registry)
    apply_diff_to_graph(graph, registry, diff)

    cache_dir = get_settings().data_path.parent
    save_metadata_cache(registry.export_metadata(), cache_dir / METADATA_CACHE_FILENAME, new_commit)
    if registry.export_search_index().is_built:
        save_search_index(registry.export_search_index(), cache_dir / SEARCH_CACHE_FILENAME, new_commit)
    save_graph(graph, cache_dir / GRAPH_CACHE_FILENAME, new_commit)
    logger.info(
        "Incremental sync applied: +%d ~%d -%d laws",
        len(diff.added),
        len(diff.modified),
        len(diff.removed),
    )


def _fallback_rebuild() -> None:
    """Drop in-memory singletons so the next request rebuilds from scratch.

    The on-disk caches still carry the old revision hash, so the next warm-up
    sees a mismatch and rebuilds + repersists them. This is the safety net for
    diffs too large or too broken to apply incrementally.
    """
    get_registry.cache_clear()
    reset_graph_cache()
    # Drop the semantic index too (#43) so the next semantic query
    # rebuilds against the fresh corpus. Cheap: the index re-embed
    # finishes in ~1 s for the 12 K-article corpus.
    reset_semantic_index()
    logger.info("Sync fell back to full rebuild (diff unavailable or too large)")
