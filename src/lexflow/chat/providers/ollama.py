"""Ollama chat provider for LexFlow."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any

import httpx
import ollama

from lexflow.chat.base import (
    ChatMessage,
    ChatProvider,
    ChatProviderError,
    FinishChunk,
    StreamChunk,
    TextChunk,
    ToolCallChunk,
    ToolSpec,
)

# Exceptions we wrap as :class:`ChatProviderError` — every plausible failure
# from the Ollama SDK or its httpx transport. Programmer bugs (``TypeError``,
# ``KeyError``, ``AttributeError``) deliberately escape so they surface as
# 500s in dev instead of being mislabelled as "Ollama error".
_OLLAMA_ERRORS = (ollama.ResponseError, httpx.HTTPError, OSError)


class OllamaProvider(ChatProvider):
    """Chat provider backed by a local Ollama instance."""

    def __init__(self, host: str = "http://localhost:11434") -> None:
        self._host = host

    async def list_models(self) -> list[str]:
        """Return model tags available in the local Ollama instance.

        The ollama SDK (0.6.x) returns a ``ListResponse`` pydantic object
        (NOT a dict), and each entry exposes the tag under ``.model``
        (older builds used ``name``). The previous ``isinstance(response,
        dict)`` + ``m["name"]`` parse returned ``[]`` for every real
        install, so pulled models never appeared in ``/models`` and the
        picker had nothing to select (#564 — same SDK-shape trap as #531).
        """
        try:
            client = ollama.AsyncClient(host=self._host)
            response = await client.list()
            raw_models = getattr(response, "models", None)
            if raw_models is None and isinstance(response, dict):
                raw_models = response.get("models", [])
            tags: list[str] = []
            for item in raw_models or []:
                tag = getattr(item, "model", None) or getattr(item, "name", None)
                if tag is None and isinstance(item, dict):
                    tag = item.get("model") or item.get("name")
                if tag:
                    tags.append(tag)
            return tags
        except _OLLAMA_ERRORS as exc:
            raise ChatProviderError(f"Ollama error: {exc}") from exc

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream a chat completion from Ollama."""
        try:
            client = ollama.AsyncClient(host=self._host)
            ollama_messages = [{"role": m.role, "content": m.content} for m in messages]
            async for chunk in await client.chat(model=model, messages=ollama_messages, stream=True):
                # Chunks are ``SubscriptableBaseModel`` (dict-like ``.get``),
                # NOT plain ``dict`` — read through ``.get`` so this works
                # against the real SDK as well as the dict-shaped test fakes.
                message = chunk.get("message") or {}
                content = message.get("content")
                if content:
                    yield content
        except _OLLAMA_ERRORS as exc:
            raise ChatProviderError(f"Ollama error: {exc}") from exc

    async def stream_chat_typed(
        self,
        messages: list[ChatMessage],
        model: str,
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Native tool-use streaming for a local Ollama instance.

        Ollama speaks OpenAI-compatible function calling since 0.4, but
        its Python SDK makes this adapter SIMPLER than the OpenAI one:

        * Tool calls arrive **fully formed** in a single chunk — Ollama
          buffers the JSON server-side, so there is no per-index fragment
          buffering to do.
        * ``function.arguments`` is already a parsed ``dict`` (not a JSON
          string) and Ollama assigns **no call id**, so we fall back to
          the tool name as the handle the agentic loop threads results
          back on.

        We surface text deltas live, collect any tool calls, then emit
        one ``ToolCallChunk`` per call followed by a ``FinishChunk``.
        Chunks are read through ``.get`` so the same path covers the real
        ``SubscriptableBaseModel`` objects and the dict-shaped test fakes.

        --- WHERE TO CHANGE IF X CHANGES ---
        * Tool-call wire shape   → Ollama ``ChatResponse.message.tool_calls``.
        * ToolSpec → tool input  → ``_tools_payload`` below.
        * History adaptation     → ``_messages_payload`` (tool turns carry
          ``tool_name`` so Ollama can match the answer to the call).
        """
        client = ollama.AsyncClient(host=self._host)
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": _messages_payload(messages),
            "stream": True,
        }
        if tools:
            kwargs["tools"] = _tools_payload(tools)

        try:
            tool_calls: list[ToolCallChunk] = []
            done_reason: str | None = None
            async for chunk in await client.chat(**kwargs):
                done_reason = chunk.get("done_reason") or done_reason
                message = chunk.get("message") or {}
                content = message.get("content")
                if content:
                    yield TextChunk(delta=content)
                for raw_call in message.get("tool_calls") or []:
                    tool_calls.append(_to_tool_call(raw_call))

            for call in tool_calls:
                yield call
            yield FinishChunk(reason=_translate_done(done_reason, has_calls=bool(tool_calls)))
        except _OLLAMA_ERRORS as exc:
            raise ChatProviderError(f"Ollama error: {exc}") from exc


def _messages_payload(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    """Adapt the LexFlow history into the Ollama message shape.

    Tool turns carry ``tool_name`` so Ollama can match the result to the
    call that produced it — Ollama keys on the name, not an id, since it
    assigns no call id. Other roles flow through unchanged.
    """
    out: list[dict[str, Any]] = []
    for msg in messages:
        if msg.role == "tool":
            entry: dict[str, Any] = {"role": "tool", "content": msg.content}
            if msg.name:
                entry["tool_name"] = msg.name
            out.append(entry)
        else:
            out.append({"role": msg.role, "content": msg.content})
    return out


def _tools_payload(tools: list[ToolSpec]) -> list[dict[str, Any]]:
    """Convert a ``ToolSpec`` list to Ollama's (OpenAI-compatible) tools shape."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            },
        }
        for tool in tools
    ]


def _to_tool_call(raw_call: Any) -> ToolCallChunk:
    """Build a ``ToolCallChunk`` from one Ollama ``tool_calls`` entry.

    Ollama assigns no call id, so the tool name doubles as the handle the
    agentic loop threads the result back on.
    """
    fn = raw_call.get("function") or {}
    name = fn.get("name") or ""
    return ToolCallChunk(
        call_id=raw_call.get("id") or name,
        name=name,
        arguments=_coerce_args(fn.get("arguments")),
    )


def _coerce_args(arguments: Any) -> dict[str, Any]:
    """Coerce Ollama's tool arguments into a plain dict.

    The native SDK hands us an already-parsed ``Mapping``; a JSON string
    is only seen from OpenAI-compat shims, so we parse that best-effort.
    """
    if arguments is None:
        return {}
    if isinstance(arguments, str):
        try:
            parsed = json.loads(arguments)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    if isinstance(arguments, dict):
        return arguments
    try:
        return dict(arguments)
    except (TypeError, ValueError):
        return {}


def _translate_done(reason: str | None, *, has_calls: bool) -> str:
    """Translate an Ollama ``done_reason`` into the LexFlow vocabulary.

    Local models emit inconsistent reasons, so anything that isn't a
    token-cap truncation collapses to ``stop`` rather than ``error`` —
    a quirky finish reason from a local model is not a failure.
    """
    if has_calls:
        return "tool_use"
    if reason == "length":
        return "length"
    return "stop"
