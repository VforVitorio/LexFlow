"""Shared OpenAI-compatible tool-use streaming.

OpenAI and LM Studio both speak the OpenAI Chat Completions wire format,
so the native tool-use adaptation is identical for both: shape the
history, build the ``tools`` payload, buffer the JSON-fragment arguments
per index, and translate the finish reason. This module owns that single
implementation; each provider wraps :func:`stream_tool_use` with its own
SDK-error → :class:`ChatProviderError` mapping (the error vocabulary is
the only thing that differs between OpenAI and LM Studio).

Keeping it here mirrors the rationale behind ``provider_registry`` —
before this module the streaming loop was duplicated across the two
OpenAI-compatible providers and the copies could silently drift.

--- WHERE TO CHANGE IF X CHANGES ---
* Tool-call wire shape   → OpenAI ``ChatCompletionChunk`` /
  ``ChoiceDeltaToolCall`` typings.
* Per-provider error text → each provider's ``stream_chat_typed`` wrapper.
* New finish reason       → :func:`translate_finish`.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, cast

from openai import AsyncOpenAI, AsyncStream
from openai.types.chat import ChatCompletionChunk

from lexflow.chat.base import (
    ChatMessage,
    FinishChunk,
    StreamChunk,
    TextChunk,
    ToolCallChunk,
    ToolSpec,
)


async def stream_tool_use(
    client: AsyncOpenAI,
    messages: list[ChatMessage],
    model: str,
    tools: list[ToolSpec] | None,
) -> AsyncIterator[StreamChunk]:
    """Stream one typed tool-use turn from an OpenAI-compatible endpoint.

    Tool calls stream as ``delta.tool_calls`` entries whose
    ``function.arguments`` arrives as JSON-string fragments. We buffer
    the fragments per index until ``finish_reason`` lands, then emit one
    ``ToolCallChunk`` per buffered call followed by a ``FinishChunk``.

    Raises the raw SDK exception on failure — the calling provider maps
    it to a provider-specific :class:`ChatProviderError`.
    """
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": adapt_messages(messages),
        "stream": True,
    }
    if tools:
        kwargs["tools"] = adapt_tools(tools)
        kwargs["tool_choice"] = "auto"

    stream = cast(
        AsyncStream[ChatCompletionChunk],
        await client.chat.completions.create(**kwargs),
    )
    # Buffer tool-call args per index; the endpoint may stream
    # ``arguments`` across many chunks before ``finish_reason``.
    pending: dict[int, dict[str, Any]] = {}
    finish_reason: str | None = None
    async for chunk in stream:
        choice = chunk.choices[0] if chunk.choices else None
        if choice is None:
            continue
        delta = choice.delta
        if delta and delta.content:
            yield TextChunk(delta=delta.content)
        tool_calls = getattr(delta, "tool_calls", None) if delta else None
        if tool_calls:
            for call_delta in tool_calls:
                bucket = pending.setdefault(
                    call_delta.index,
                    {"call_id": "", "name": "", "args_text": ""},
                )
                if getattr(call_delta, "id", None):
                    bucket["call_id"] = call_delta.id
                fn = getattr(call_delta, "function", None)
                if fn is not None:
                    if getattr(fn, "name", None):
                        bucket["name"] = fn.name
                    if getattr(fn, "arguments", None):
                        bucket["args_text"] += fn.arguments
        if choice.finish_reason:
            finish_reason = choice.finish_reason
            break

    for bucket in pending.values():
        yield ToolCallChunk(
            call_id=bucket["call_id"] or bucket["name"],
            name=bucket["name"],
            arguments=parse_args(bucket["args_text"]),
        )
    yield FinishChunk(reason=translate_finish(finish_reason, has_calls=bool(pending)))


def adapt_messages(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    """Adapt the LexFlow history into the OpenAI message shape.

    Tool turns need ``tool_call_id`` per the Chat API contract; without
    it the API refuses the request. Other roles flow through unchanged.
    """
    out: list[dict[str, Any]] = []
    for msg in messages:
        if msg.role == "tool":
            out.append(
                {
                    "role": "tool",
                    "content": msg.content,
                    "tool_call_id": msg.tool_call_id or msg.name or "tool",
                }
            )
        else:
            out.append({"role": msg.role, "content": msg.content})
    return out


def adapt_tools(tools: list[ToolSpec]) -> list[dict[str, Any]]:
    """Convert a ``ToolSpec`` list to the OpenAI ``tools`` payload shape."""
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


def parse_args(args_text: str) -> dict[str, Any]:
    """Best-effort JSON parse of the buffered argument fragments.

    The model occasionally emits a malformed JSON fragment on partial
    streams. We log nothing here — the dispatcher returns an ``error``
    payload if the args don't match the tool signature.
    """
    if not args_text:
        return {}
    try:
        parsed = json.loads(args_text)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def translate_finish(reason: str | None, *, has_calls: bool) -> str:
    """Translate an OpenAI-compatible finish reason into LexFlow's vocabulary."""
    if has_calls or reason == "tool_calls":
        return "tool_use"
    if reason == "length":
        return "length"
    if reason in {None, "stop"}:
        return "stop"
    return "error"
