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

import asyncio
import json
import logging
import shutil
import sys
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

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


# ---------------------------------------------------------------------------
# POST /api/v1/system/semantic-install (#578) — install the optional
# ``[semantic]`` extra in-app with SSE progress, so a lawyer never has to run
# a terminal command. Mirrors the wire format of ``/models/pull``.
# ---------------------------------------------------------------------------

# The single package the ``[semantic]`` extra adds (pyproject ``semantic``).
# Pinned to the same floor as pyproject so the in-app install matches a
# ``uv sync --extra semantic``. torch + transformers come in as its deps.
_SEMANTIC_PACKAGE = "sentence-transformers>=3.0"

# Only one install may run at a time per process — a multi-GB torch download
# started twice would thrash the disk and race the import.
_SEMANTIC_INSTALL_LOCK = asyncio.Lock()


def _sse(event: str, data: dict[str, Any]) -> bytes:
    """One Server-Sent Event line as UTF-8 bytes (same wire shape as pull)."""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n".encode()


def _resolve_install_command() -> list[str] | None:
    """Pick the command that installs the ``[semantic]`` extra additively.

    Prefers ``uv pip install`` (fast, and the project's package manager) when
    ``uv`` is on PATH; otherwise pip-installs into the current interpreter.
    Both are *additive* — unlike ``uv sync --extra semantic``, which would
    UNINSTALL the other active extras (chat, dashboards) out from under the
    running server. Returns ``None`` when no install path is usable.

    --- WHERE TO CHANGE IF PACKAGING CHANGES ---
    A frozen PyInstaller build has no pip/uv and bundles deps at build time,
    so this runtime path is dev/source-run only. If the packaged app ever
    needs the model at runtime, download weights into a user-writable cache
    dir instead of mutating a venv.
    """
    if getattr(sys, "frozen", False):
        return None
    uv = shutil.which("uv")
    if uv:
        return [uv, "pip", "install", _SEMANTIC_PACKAGE]
    return [sys.executable, "-m", "pip", "install", _SEMANTIC_PACKAGE]


async def _semantic_install_stream() -> AsyncIterator[bytes]:
    """Run the install subprocess and stream its output as SSE events.

    Generator contract (mirrors ``/models/pull``):
        * one ``progress`` event per non-empty output line (``{"status": …}``);
        * a final ``done`` event ``{"package": …}`` on exit code 0;
        * a single ``error`` event ``{"code", "message"}`` on any failure,
          then stop. The SPA branches on the code.
    """
    command = _resolve_install_command()
    if command is None:
        yield _sse(
            "error",
            {
                "code": "semantic_install_unavailable",
                "message": "Automatic install isn't available in this build. Reinstall with the semantic extra.",
            },
        )
        return

    yield _sse("progress", {"status": "Starting install…"})
    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except OSError as exc:
        logger.exception("Could not launch semantic install")
        yield _sse("error", {"code": "semantic_install_spawn_failed", "message": str(exc)})
        return

    assert process.stdout is not None
    async for raw_line in process.stdout:
        line = raw_line.decode(errors="replace").rstrip()
        if line:
            yield _sse("progress", {"status": line})
    return_code = await process.wait()

    if return_code == 0:
        yield _sse("done", {"package": _SEMANTIC_PACKAGE})
    else:
        yield _sse(
            "error",
            {"code": "semantic_install_failed", "message": f"Install exited with code {return_code}."},
        )


@router.post(
    "/semantic-install",
    summary="Install the optional [semantic] extra and stream progress via SSE (#578).",
    responses={
        200: {
            "description": "Server-sent events stream with progress / done / error.",
            "content": {"text/event-stream": {}},
        },
        429: {"description": "Another semantic install is already running."},
    },
)
async def install_semantic() -> StreamingResponse:
    """Trigger an in-app install of the ``[semantic]`` extra (#578).

    Replaces the developer CLI instructions the Settings card used to show a
    lawyer. The SPA renders the streamed status lines as a progress log and,
    on ``done``, re-queries ``/semantic-status`` to confirm the extra is now
    installed (the new model is picked up lazily on the next search).
    """
    if _SEMANTIC_INSTALL_LOCK.locked():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "semantic_install_busy",
                "message": "A semantic install is already running. Wait for it to finish.",
            },
        )

    async def gated_stream() -> AsyncIterator[bytes]:
        async with _SEMANTIC_INSTALL_LOCK:
            async for chunk in _semantic_install_stream():
                yield chunk

    return StreamingResponse(
        gated_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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
