"""OpenAI chat provider for LexFlow."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any, cast

import openai
from openai import AsyncStream
from openai.types.chat import ChatCompletionChunk

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
from lexflow.chat.secrets import get_api_key


class OpenAIProvider(ChatProvider):
    """Chat provider backed by the OpenAI API.

    Key resolution order (see ``chat/secrets.py``):
      1. Explicit ``api_key`` argument (tests, scripted use).
      2. ``OPENAI_API_KEY`` env var (back-compat, headless deploys).
      3. OS keyring (the user-facing path on desktop installs).
    ``None`` is fine for ``list_models`` (will surface a clean
    ``ChatProviderError`` on call) — we don't validate eagerly at
    construction so the provider stays cheap to instantiate.
    """

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or get_api_key("openai")
        self._client = openai.AsyncOpenAI(api_key=resolved_key)

    async def list_models(self) -> list[str]:
        """Return all available GPT model IDs."""
        try:
            response = await self._client.models.list()
            return sorted(m.id for m in response.data if m.id.startswith("gpt"))
        except openai.AuthenticationError as exc:
            # Audit #409: SDK exception string can include the partially
            # echoed API key and organisation id. Keep the client-
            # facing message static; the original ``exc`` is still the
            # ``__cause__`` so the streaming layer logs the full body
            # server-side via ``logger.exception``.
            raise ChatProviderError("OpenAI authentication failed") from exc
        except openai.RateLimitError as exc:
            raise ChatProviderError("OpenAI rate limit exceeded") from exc

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completions from OpenAI, yielding text chunks."""
        openai_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
        try:
            stream = cast(
                AsyncStream[ChatCompletionChunk],
                await self._client.chat.completions.create(
                    model=model,
                    messages=openai_messages,  # type: ignore[arg-type]
                    stream=True,
                ),
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
        except openai.AuthenticationError as exc:
            # Audit #409: SDK exception string can include the partially
            # echoed API key and organisation id. Keep the client-
            # facing message static; the original ``exc`` is still the
            # ``__cause__`` so the streaming layer logs the full body
            # server-side via ``logger.exception``.
            raise ChatProviderError("OpenAI authentication failed") from exc
        except openai.RateLimitError as exc:
            raise ChatProviderError("OpenAI rate limit exceeded") from exc

    async def stream_chat_typed(
        self,
        messages: list[ChatMessage],
        model: str,
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Native function-calling streaming for the OpenAI Chat API.

        OpenAI streams tool calls as ``delta.tool_calls`` entries whose
        ``function.arguments`` arrives as JSON-string fragments. We
        buffer the fragments per index until ``finish_reason`` lands,
        then emit one ``ToolCallChunk`` per buffered call followed by a
        ``FinishChunk`` carrying the SDK's reason translated to our
        vocabulary.

        --- WHERE TO CHANGE IF X CHANGES ---
        * Tool-call wire shape   → OpenAI's ``ChatCompletionChunk`` and
          ``ChoiceDeltaToolCall`` typings.
        * ToolSpec → tool input  → ``_tools_payload`` below.
        * History adaptation     → ``_messages_payload`` (tool role
          needs ``tool_call_id`` per OpenAI's tool message shape).
        """
        openai_messages = _messages_payload(messages)
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": openai_messages,
            "stream": True,
        }
        if tools:
            kwargs["tools"] = _tools_payload(tools)
            kwargs["tool_choice"] = "auto"

        try:
            stream = cast(
                AsyncStream[ChatCompletionChunk],
                await self._client.chat.completions.create(**kwargs),
            )
            # Buffer tool-call args per index; OpenAI may stream
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
                    arguments=_parse_args(bucket["args_text"]),
                )
            yield FinishChunk(reason=_translate_finish(finish_reason, has_calls=bool(pending)))
        except openai.AuthenticationError as exc:
            raise ChatProviderError("OpenAI authentication failed") from exc
        except openai.RateLimitError as exc:
            raise ChatProviderError("OpenAI rate limit exceeded") from exc


def _messages_payload(messages: list[ChatMessage]) -> list[dict[str, Any]]:
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


def _tools_payload(tools: list[ToolSpec]) -> list[dict[str, Any]]:
    """Convert ``ToolSpec`` list to OpenAI's ``tools`` payload shape."""
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


def _parse_args(args_text: str) -> dict[str, Any]:
    """Best-effort JSON parse of the buffered argument fragments.

    The model occasionally emits a malformed JSON fragment on partial
    streams. We log nothing here — the dispatcher will return an
    ``error`` payload if the args don't match the tool signature.
    """
    if not args_text:
        return {}
    try:
        parsed = json.loads(args_text)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _translate_finish(reason: str | None, *, has_calls: bool) -> str:
    """Translate an OpenAI finish reason into the LexFlow vocabulary."""
    if has_calls or reason == "tool_calls":
        return "tool_use"
    if reason == "length":
        return "length"
    if reason in {None, "stop"}:
        return "stop"
    return "error"
