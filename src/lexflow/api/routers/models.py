"""``GET /api/v1/models`` — lists every (provider, model) pair the user can pick.

Probes each chat provider concurrently with a short timeout. A provider
that isn't reachable (Ollama not running, no API key for a cloud provider)
yields a single placeholder ``ModelInfo`` with ``configured=False`` so the
frontend can render a "needs setup" affordance without omitting the
provider entirely.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new provider:  edit ``PROVIDER_SPECS`` in
  ``lexflow.chat.provider_registry`` + add a factory in
  ``src/lexflow/chat/providers/`` that exposes ``list_models()``.
* Tweak context-window heuristics: edit ``_context_window_for``.
* Tighten the probe timeout: ``_PROBE_TIMEOUT_S``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator, Awaitable
from typing import Any

import ollama
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from lexflow.chat import provider_registry
from lexflow.chat.base import ChatProviderError
from lexflow.chat.provider_registry import ProviderSpec
from lexflow.chat.schemas import ModelInfo

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Models"])

# Audit #409: ``/models/pull`` had no concurrency guard, so a single
# unauthenticated request could spawn parallel ``ollama pull`` jobs
# downloading hundreds of GB of model weights. ``_PULL_IN_FLIGHT`` is
# a single-permit semaphore — only one pull may run at a time per
# process. The lifecycle is `acquire on request → release on stream
# completion / cancel`. A request that hits the closed door gets a
# 429 immediately.
_PULL_IN_FLIGHT = asyncio.Semaphore(1)

# Probe budget per provider. Ollama / LM Studio block on TCP if not running,
# so we cap each probe so the overall request can never exceed
# ``len(PROVIDER_SPECS) * _PROBE_TIMEOUT_S`` even in the worst case.
_PROBE_TIMEOUT_S = 2.0


def _context_window_for(provider: str, model: str, default: int) -> int:
    """Best-effort context-window heuristic.

    Only catches a handful of common model name patterns. Falls back to the
    provider's default for anything unknown.
    """
    lower = model.lower()
    # OpenAI ladder: 4o family is 128k, 3.5 is 16k.
    if provider == "openai":
        if "gpt-4o" in lower or "gpt-4-turbo" in lower or "gpt-4.1" in lower:
            return 128_000
        if "gpt-3.5" in lower:
            return 16_385
    # Anthropic: every modern Claude is 200k.
    if provider == "anthropic" and "claude" in lower:
        return 200_000
    # Google Gemini: 1.5 / 2.0 are 1M; 1.0 is 32k.
    if provider == "google":
        if "1.0" in lower:
            return 32_768
        if "gemini" in lower:
            return 1_000_000
    return default


def _unconfigured_placeholder(spec: ProviderSpec, error: str) -> ModelInfo:
    """Build the "this provider isn't usable yet" row (Sprint 5 rf-2).

    Five branches of ``_probe`` produced the same shape with only the
    ``error=`` differing; this helper is the single source of truth.
    """
    return ModelInfo(
        id=f"{spec.key}:",
        provider=spec.key,
        model="",
        local=spec.local,
        configured=False,
        context_window=None,
        error=error,
    )


async def _probe(spec: ProviderSpec) -> list[ModelInfo]:
    """Probe one provider. Always returns ≥ 1 entry — never raises.

    Empty model list with ``configured=False`` is the placeholder for
    "user hasn't set this up yet" so the frontend can render the provider
    row with a setup hint instead of pretending it doesn't exist.
    """
    if not spec.has_credentials():
        return [_unconfigured_placeholder(spec, "Missing credentials")]

    try:
        provider = spec.factory()
    except Exception as exc:
        logger.warning("Failed to construct %s provider: %s", spec.key, exc)
        return [_unconfigured_placeholder(spec, str(exc))]

    try:
        models = await asyncio.wait_for(provider.list_models(), timeout=_PROBE_TIMEOUT_S)
    except TimeoutError:
        message = "Probe timed out"
        logger.info("%s: %s after %.1fs", spec.key, message, _PROBE_TIMEOUT_S)
        return [_unconfigured_placeholder(spec, message)]
    except ChatProviderError as exc:
        logger.info("%s probe failed: %s", spec.key, exc)
        return [_unconfigured_placeholder(spec, str(exc))]

    if not models:
        return [_unconfigured_placeholder(spec, "No models available")]

    return [
        ModelInfo(
            id=f"{spec.key}:{name}",
            provider=spec.key,
            model=name,
            local=spec.local,
            configured=True,
            context_window=_context_window_for(spec.key, name, spec.default_context),
            error=None,
        )
        for name in models
    ]


# #554 — probing all 5 providers (2 s timeout each) costs ~2.25 s on every
# /models call, and Settings + the model picker hit it repeatedly. Cache the
# flattened result for a short TTL: provider availability doesn't flip
# second-to-second, and the wizard's "Re-detect" passes ?refresh=true to
# bypass it. Module-level (the probe result is the same for everyone).
_MODELS_CACHE_TTL_S = 45.0
_models_cache: tuple[float, list[ModelInfo]] | None = None


def _reset_models_cache() -> None:
    """Clear the /models probe cache (used by tests to avoid cross-test leak)."""
    global _models_cache
    _models_cache = None


@router.get(
    "/models",
    response_model=list[ModelInfo],
    summary="List every chat model the user can pick across all providers.",
)
async def list_models(
    refresh: bool = Query(False, description="Bypass the cache and re-probe providers now"),
) -> list[ModelInfo]:
    """Return every available (provider, model) pair, flat.

    Each provider is probed concurrently with a short timeout. Unreachable
    or unconfigured providers still appear as a single placeholder entry
    (``configured: false``). The result is cached for ~45 s (#554); pass
    ``?refresh=true`` (e.g. the wizard's re-detect) to force a fresh probe.
    """
    global _models_cache
    now = time.monotonic()
    if not refresh and _models_cache is not None:
        cached_at, cached = _models_cache
        if now - cached_at < _MODELS_CACHE_TTL_S:
            return cached
    # Read through the module attribute so tests can monkeypatch
    # ``PROVIDER_SPECS`` and the change reaches this handler.
    probes: list[Awaitable[list[ModelInfo]]] = [_probe(spec) for spec in provider_registry.PROVIDER_SPECS]
    results = await asyncio.gather(*probes)
    models = [model for batch in results for model in batch]
    _models_cache = (now, models)
    return models


# ---------------------------------------------------------------------------
# POST /api/v1/models/pull  (#119) — install an Ollama model with SSE progress
# ---------------------------------------------------------------------------

# Ollama model tag shape: ``name`` or ``name:tag``. We accept a narrow alphabet
# so the value can't smuggle whitespace, shell metacharacters, or URLs into the
# downstream API call. The library validates server-side too, but a tight
# boundary check here gives the SPA a deterministic 422 instead of a stream
# that errors mid-flight.
_OLLAMA_TAG_PATTERN = r"^[a-zA-Z0-9._-]+(?::[a-zA-Z0-9._-]+)?$"


class ModelPullRequest(BaseModel):
    """Body for ``POST /api/v1/models/pull``."""

    model: str = Field(
        ...,
        pattern=_OLLAMA_TAG_PATTERN,
        min_length=1,
        max_length=128,
        description="Ollama model tag, e.g. ``qwen2.5:7b`` or ``llama3.2``.",
    )


def _sse(event: str, data: dict[str, Any]) -> bytes:
    """One Server-Sent Event line as UTF-8 bytes.

    Kept local (not imported from ``lexflow.chat.streaming``) so the
    models module stays decoupled from the chat module — same wire format,
    independent dependency graphs.
    """
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n".encode()


def _normalise_progress(raw: Any) -> dict[str, Any]:
    """Flatten an ``ollama.ProgressResponse`` to the wire shape.

    The Ollama lib returns Pydantic objects; we project the four fields the
    SPA actually renders (``status`` + the bytes counters + the digest of
    the layer currently transferring). Everything else stays internal.
    """
    return {
        "status": getattr(raw, "status", None),
        "completed": getattr(raw, "completed", None),
        "total": getattr(raw, "total", None),
        "digest": getattr(raw, "digest", None),
    }


async def _pull_progress(model: str) -> AsyncIterator[bytes]:
    """Stream the Ollama pull as ``progress``/``done``/``error`` SSE events.

    Generator contract:
        * yields one ``progress`` event per ``ProgressResponse`` from Ollama;
        * yields a final ``done`` event with ``{"model": <tag>}`` on success;
        * yields a single ``error`` event with ``{"code", "message"}`` and
          stops on any provider failure — the StreamingResponse closes cleanly
          for the client, the SPA can branch on the code.

    Cancellation: ``asyncio.CancelledError`` propagates (Starlette raises it
    on client disconnect) so we don't synthesise a fake error event for what
    is just the client going away.
    """
    client = ollama.AsyncClient()
    try:
        async for progress in await client.pull(model, stream=True):
            yield _sse("progress", _normalise_progress(progress))
    except asyncio.CancelledError:
        raise
    except ollama.ResponseError as exc:
        logger.info("Ollama pull failed: status=%s message=%s", repr(exc.status_code), repr(exc.error))
        yield _sse(
            "error",
            {"code": "ollama_pull_failed", "message": exc.error or "Ollama rejected the pull"},
        )
        return
    except Exception:
        # Network drop, daemon down, unexpected payload — log the trace
        # server-side, emit a generic event so the SPA never sees a raw
        # exception message.
        logger.exception("Unexpected error during ollama pull")
        yield _sse(
            "error",
            {"code": "ollama_pull_unreachable", "message": "Could not reach the Ollama daemon"},
        )
        return
    yield _sse("done", {"model": model})


@router.post(
    "/models/pull",
    summary="Install an Ollama model and stream its progress via SSE (#119).",
    responses={
        200: {
            "description": "Server-sent events stream with progress / done / error.",
            "content": {"text/event-stream": {}},
        },
        422: {"description": "Model tag failed validation."},
    },
)
async def pull_model(body: ModelPullRequest) -> StreamingResponse:
    """Trigger ``ollama pull <model>`` and stream the progress to the SPA.

    Consumed by the model wizard's confirm step (#118). The wizard kicks the
    request, renders the byte counters as a progress bar, and treats the
    ``done`` event as "model is installed; re-detect to verify".

    Audit #409: only one pull may run at a time per process. A second
    request while one is in flight gets ``429 Too Many Requests`` so an
    attacker (or a confused user clicking twice) can't fill the disk
    with parallel multi-GB downloads.
    """
    if _PULL_IN_FLIGHT.locked():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "model_pull_busy",
                "message": "Another model pull is already running. Wait for it to finish before starting a new one.",
            },
        )

    async def gated_stream() -> AsyncIterator[bytes]:
        # Hold the semaphore for the lifetime of the stream so the gate
        # releases exactly when the SPA sees the ``done``/``error`` event.
        async with _PULL_IN_FLIGHT:
            async for chunk in _pull_progress(body.model):
                yield chunk

    return StreamingResponse(
        gated_stream(),
        media_type="text/event-stream",
        headers={
            # Disable response buffering on reverse proxies (nginx etc.)
            # so chunks reach the client immediately.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Ollama model management (#597) — list installed / load-warm / eject / delete
# so a lawyer manages local models from Settings instead of a terminal.
# ---------------------------------------------------------------------------

# How long a "Cargar" keeps the model warm in Ollama's memory; "Eject" sends
# 0 to unload it immediately.
_KEEP_ALIVE_WARM = "30m"
_KEEP_ALIVE_EJECT = 0


class InstalledModel(BaseModel):
    """One Ollama model already on disk (projected from ``ollama list``)."""

    name: str
    size_bytes: int | None = Field(default=None, description="On-disk size in bytes, if reported.")
    loaded: bool = Field(default=False, description="Currently held warm in memory (``ollama ps``).")


class InstalledModelsResponse(BaseModel):
    """Installed Ollama models for the Settings → Modelos management card."""

    models: list[InstalledModel]


class ModelNameRequest(BaseModel):
    """Body carrying a single validated Ollama tag (delete / load / eject)."""

    model: str = Field(..., pattern=_OLLAMA_TAG_PATTERN, min_length=1, max_length=128)


class ModelLoadRequest(ModelNameRequest):
    """Load/eject toggle: ``keep=True`` warms the model, ``False`` ejects it."""

    keep: bool = True


@router.get(
    "/models/installed",
    response_model=InstalledModelsResponse,
    summary="List installed Ollama models with size + loaded state (#597).",
)
async def list_installed_models() -> InstalledModelsResponse:
    """Project ``ollama list`` (on-disk) joined with ``ollama ps`` (loaded).

    Ollama not running is not an error here — it just means no local models,
    so we return an empty list and let the SPA show the "Ollama no detectado"
    state rather than a 5xx.
    """
    client = ollama.AsyncClient()
    try:
        listing = await client.list()
        running = await client.ps()
    except Exception:
        logger.info("Ollama unreachable while listing installed models")
        return InstalledModelsResponse(models=[])

    loaded_names = {getattr(m, "model", None) for m in getattr(running, "models", [])}
    installed: list[InstalledModel] = []
    for entry in getattr(listing, "models", []):
        name = getattr(entry, "model", None)
        if not name:
            continue
        installed.append(
            InstalledModel(name=name, size_bytes=getattr(entry, "size", None), loaded=name in loaded_names)
        )
    installed.sort(key=lambda m: m.name)
    return InstalledModelsResponse(models=installed)


@router.post(
    "/models/delete",
    summary="Delete an installed Ollama model (``ollama rm``) (#597).",
    responses={404: {"description": "Model is not installed."}, 502: {"description": "Ollama unreachable."}},
)
async def delete_model(body: ModelNameRequest) -> dict[str, str]:
    """Remove a model from disk. POST (not DELETE) so the ``name:tag`` colon
    never has to survive a URL path round-trip through the SPA's client."""
    client = ollama.AsyncClient()
    try:
        await client.delete(body.model)
    except ollama.ResponseError as exc:
        if exc.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "model_not_found", "message": f"{body.model} is not installed."},
            ) from exc
        logger.info("Ollama delete failed: status=%s", repr(exc.status_code))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "model_delete_failed", "message": "Ollama rejected the delete."},
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error deleting model")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "ollama_unreachable", "message": "Could not reach the Ollama daemon."},
        ) from exc
    return {"status": "deleted", "model": body.model}


@router.post(
    "/models/load",
    summary="Warm a model into memory or eject it (Ollama keep_alive) (#597).",
    responses={502: {"description": "Ollama unreachable."}},
)
async def load_model(body: ModelLoadRequest) -> dict[str, str]:
    """Preload (``keep=True``) or unload (``keep=False``) a model.

    Issues an empty ``generate`` with ``keep_alive`` set — Ollama's documented
    way to load/unload without producing tokens.
    """
    client = ollama.AsyncClient()
    keep_alive = _KEEP_ALIVE_WARM if body.keep else _KEEP_ALIVE_EJECT
    try:
        await client.generate(model=body.model, prompt="", keep_alive=keep_alive)
    except ollama.ResponseError as exc:
        logger.info("Ollama load/eject failed: status=%s", repr(exc.status_code))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "model_load_failed", "message": "Ollama rejected the request."},
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error loading/ejecting model")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "ollama_unreachable", "message": "Could not reach the Ollama daemon."},
        ) from exc
    return {"status": "loaded" if body.keep else "ejected", "model": body.model}
