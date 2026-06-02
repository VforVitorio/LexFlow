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
from collections.abc import AsyncIterator, Awaitable
from typing import Any

import ollama
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from lexflow.chat import provider_registry
from lexflow.chat.base import ChatProviderError
from lexflow.chat.provider_registry import ProviderSpec
from lexflow.chat.schemas import ModelInfo

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Models"])

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


@router.get(
    "/models",
    response_model=list[ModelInfo],
    summary="List every chat model the user can pick across all providers.",
)
async def list_models() -> list[ModelInfo]:
    """Return every available (provider, model) pair, flat.

    Each provider is probed concurrently with a short timeout. Unreachable
    or unconfigured providers still appear in the response as a single
    placeholder entry (``configured: false``) so the UI can show them.
    """
    # Read through the module attribute so tests can monkeypatch
    # ``PROVIDER_SPECS`` and the change reaches this handler.
    probes: list[Awaitable[list[ModelInfo]]] = [_probe(spec) for spec in provider_registry.PROVIDER_SPECS]
    results = await asyncio.gather(*probes)
    return [model for batch in results for model in batch]


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
    """
    return StreamingResponse(
        _pull_progress(body.model),
        media_type="text/event-stream",
        headers={
            # Disable response buffering on reverse proxies (nginx etc.)
            # so chunks reach the client immediately.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
