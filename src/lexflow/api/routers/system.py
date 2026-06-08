"""System endpoints — process introspection (warm-up, version, health, what's new).

Endpoints:
* ``GET /system/warmup``          (#222) — warm-up progress polled by the SPA.
* ``GET /system/whats-new``       (#228) — corpus diff since last recorded commit.
* ``GET /system/profile``         (#117) — hardware + local LLM providers for the wizard.
* ``GET /system/semantic-status`` (#43)  — semantic-search backend availability.

The conventional ``/health`` lives at the app root for compatibility with
infrastructure probes that don't know the ``/api/v1`` prefix.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from lexflow.api.warmup import get_warmup_state
from lexflow.core.corpus_revision import UNKNOWN_REVISION, submodule_hash
from lexflow.core.delta_sync import diff_corpus_since
from lexflow.core.exceptions import LawNotFoundError
from lexflow.core.health import HealthSnapshot, build_health_snapshot
from lexflow.core.registry import get_registry
from lexflow.core.schemas import (
    SemanticStatusResponse,
    SystemProfileResponse,
    WarmupStatusResponse,
    WhatsNewCorpus,
    WhatsNewLaw,
    WhatsNewResponse,
)
from lexflow.core.system_profile import build_system_profile
from lexflow.search.embedder_factory import SENTENCE_TRANSFORMERS_BACKEND, is_sentence_transformers_available
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


# Sprint 7 api-12: ``/whats-new`` is the only kebab-case URL segment in
# the v1 surface. Considered renaming to ``/system/changes`` for
# consistency but the cost of a deprecation alias + SPA + chip-link
# updates outweighs the win on a single endpoint. Leaving as-is; if a
# v2 ever lands, line this up with the rest then.
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
        # Narrowed in Sprint 5 (rf-3): a bare `except Exception` hid real
        # programming bugs. The legitimate cases are: the law was just
        # removed (LawNotFoundError) or its frontmatter is broken (the
        # parser raises OSError on missing files and ValueError on bad
        # YAML). Anything else should crash loudly.
        except (LawNotFoundError, OSError, ValueError):
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


@router.get(
    "/profile",
    response_model=SystemProfileResponse,
    summary="Host hardware + local LLM providers, consumed by the model wizard (#117).",
)
async def get_system_profile() -> SystemProfileResponse:
    """Return a one-shot snapshot of host capacity.

    The wizard runs detection once during onboarding (and again only when
    the user explicitly relaunches it). Bounded at ~700 ms total because
    each local-provider probe is capped at 500 ms and they run
    concurrently.
    """
    profile = await build_system_profile()
    return SystemProfileResponse(
        total_ram_gb=profile.total_ram_gb,
        available_ram_gb=profile.available_ram_gb,
        cpu_cores=profile.cpu_cores,
        has_nvidia_gpu=profile.has_nvidia_gpu,
        vram_gb=profile.vram_gb,
        gpu_name=profile.gpu_name,
        is_apple_silicon=profile.is_apple_silicon,
        platform=profile.platform,
        ollama_running=profile.ollama_running,
        ollama_models=profile.ollama_models,
        lmstudio_running=profile.lmstudio_running,
    )


@router.get(
    "/semantic-status",
    response_model=SemanticStatusResponse,
    summary="Whether real semantic search is available + active (#43).",
)
def get_semantic_status() -> SemanticStatusResponse:
    """Report the semantic-search backend state for Settings → Models.

    Lets the SPA show whether the optional ``[semantic]`` extra is
    installed and whether real (model-based) ranking is actually in
    effect, plus how to enable it. Pure introspection — no model load.
    """
    settings = get_settings()
    backend = settings.embedder_backend
    installed = is_sentence_transformers_available()
    return SemanticStatusResponse(
        backend=backend,
        installed=installed,
        active=backend == SENTENCE_TRANSFORMERS_BACKEND and installed,
        model=settings.embedder_model,
    )


@router.get(
    "/health",
    response_model=HealthSnapshot,
    summary="Extended health snapshot — memory, disk, corpus, chat DB (#74).",
)
def get_system_health() -> HealthSnapshot:
    """Return a structured health snapshot.

    Unlike the unprefixed ``/health`` (which stays a one-liner for cheap
    liveness probes), this endpoint runs the full set of probes. Aimed
    at the Settings → Diagnostics panel and external ops dashboards.
    """
    return build_health_snapshot()
