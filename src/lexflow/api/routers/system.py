"""System endpoints — process introspection (warm-up, version, health, what's new).

Endpoints:
* ``GET /system/warmup``     (#222) — warm-up progress polled by the SPA.
* ``GET /system/whats-new``  (#228) — corpus diff since last recorded commit.

The conventional ``/health`` lives at the app root for compatibility with
infrastructure probes that don't know the ``/api/v1`` prefix.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from lexflow.api.warmup import get_warmup_state
from lexflow.core.corpus_revision import UNKNOWN_REVISION, submodule_hash
from lexflow.core.delta_sync import diff_corpus_since
from lexflow.core.registry import get_registry
from lexflow.core.schemas import (
    WarmupStatusResponse,
    WhatsNewCorpus,
    WhatsNewLaw,
    WhatsNewResponse,
)
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

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


@router.get(
    "/whats-new",
    response_model=WhatsNewResponse,
    summary="What changed in the corpus since the given commit (#228).",
)
def get_whats_new(
    since: str | None = Query(
        default=None,
        description="Commit hash of the last corpus revision seen by the client "
        "(stored in localStorage). Omit or pass null on first launch.",
    ),
) -> WhatsNewResponse:
    """Return a corpus diff between *since* and the current HEAD.

    On first launch (``since`` absent) or when the diff is unavailable,
    returns empty lists — the SPA degrades to showing tips instead.
    """
    settings = get_settings()
    data_path = settings.data_path
    current = submodule_hash(data_path)

    empty = WhatsNewResponse(corpus=WhatsNewCorpus(to_commit=current if current != UNKNOWN_REVISION else None))

    if not since or since == UNKNOWN_REVISION or current == UNKNOWN_REVISION:
        return empty

    diff = diff_corpus_since(data_path, since)
    if diff is None or diff.is_empty:
        return empty

    registry = get_registry()

    def _law(law_id: str) -> WhatsNewLaw:
        try:
            title = registry.get_metadata(law_id).title
        # If the law was just removed or never parsed, skip the title lookup.
        except Exception:
            title = None
        return WhatsNewLaw(law_id=law_id, title=title)

    return WhatsNewResponse(
        corpus=WhatsNewCorpus(
            from_commit=since,
            to_commit=current,
            added=[_law(lid) for lid in diff.added],
            modified=[_law(lid) for lid in diff.modified],
            removed=diff.removed,
        )
    )
