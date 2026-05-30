"""Sync endpoint: pull latest legalize-es and refresh state incrementally.

``POST /api/v1/sync`` runs ``git pull`` on the legalize-es submodule, then
patches the in-memory registry, search index and graph for just the laws that
changed (#230) and rewrites the on-disk caches. If the diff can't be trusted
(git failure, or a change touching thousands of laws) it falls back to dropping
the caches so the next request rebuilds wholesale.
"""

from __future__ import annotations

import logging
import subprocess

from fastapi import APIRouter, HTTPException

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
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])

GRAPH_CACHE_FILENAME = "graph_cache.json"


@router.post("")
def sync_corpus() -> dict[str, str | int]:
    """Pull the latest legalize-es revision and refresh state.

    Returns a payload describing what happened: ``mode`` is ``noop`` (nothing
    changed), ``incremental`` (a bounded delta was applied), or ``rebuild``
    (caches dropped for a full rebuild on next use).
    """
    settings = get_settings()
    data_path = settings.data_path
    registry = get_registry()

    before_commit = submodule_hash(data_path)
    output = _git_pull(str(data_path))
    after_commit = submodule_hash(data_path)

    if before_commit == after_commit and before_commit != "unknown":
        return {"status": "ok", "mode": "noop", "output": output}

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


def _git_pull(data_path: str) -> str:
    """Run ``git pull --ff-only`` in the submodule, raising HTTP errors."""
    try:
        result = subprocess.run(
            ["git", "-C", data_path, "pull", "--ff-only"],
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as exc:
        logger.error("git pull failed: %s", exc.stderr)
        raise HTTPException(status_code=500, detail=f"git pull failed: {exc.stderr}") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="git pull timed out") from exc
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
    logger.info("Sync fell back to full rebuild (diff unavailable or too large)")
