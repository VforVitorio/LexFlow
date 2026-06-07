"""Anthropic chat provider for LexFlow."""

from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any

import anthropic

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

_ANTHROPIC_MODELS: list[str] = [
    # Stay aligned with the current Claude 4.X family (#104 #14). Opus
    # bumped from 4.6 → 4.8; Sonnet 4.6 and Haiku 4.5 remain current.
    # When the line moves again, bump these IDs alongside any code that
    # pins a default model elsewhere.
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
]


class AnthropicProvider(ChatProvider):
    """Chat provider backed by the Anthropic API."""

    def __init__(self, api_key: str | None = None) -> None:
        # Key resolution: explicit arg → env var → OS keyring. See
        # ``chat/secrets.py`` for the full contract.
        resolved_key = api_key or get_api_key("anthropic")
        self._client = anthropic.AsyncAnthropic(api_key=resolved_key)

    async def list_models(self) -> list[str]:
        """Return the list of supported Anthropic model IDs."""
        return list(_ANTHROPIC_MODELS)

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completions from Anthropic, yielding text chunks."""
        system_prompt, user_messages = _split_system(messages)

        try:
            async with self._client.messages.stream(
                model=model,
                max_tokens=4096,
                system=system_prompt,
                messages=user_messages,  # type: ignore[arg-type]
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except anthropic.RateLimitError as exc:
            # Audit #409: SDK exception body may carry a partial key or
            # workspace id. Use a static message; the original ``exc``
            # remains the ``__cause__`` for server-side logs.
            raise ChatProviderError("Anthropic rate limit exceeded") from exc
        except anthropic.AuthenticationError as exc:
            raise ChatProviderError("Anthropic authentication failed") from exc

    async def stream_chat_typed(
        self,
        messages: list[ChatMessage],
        model: str,
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Native tool-use streaming for the Anthropic Messages API.

        Anthropic emits content blocks of two kinds:

        * ``text`` — ``input_text_delta`` events stream characters.
        * ``tool_use`` — ``input_json_delta`` events stream argument
          JSON fragments; ``content_block_stop`` finalises the block.

        We surface text deltas live, buffer tool-use args per block
        index, then emit one ``ToolCallChunk`` per finished block plus
        a ``FinishChunk`` carrying the SDK's ``stop_reason`` translated
        to the LexFlow vocabulary (``tool_use``/``stop``/``length``).

        --- WHERE TO CHANGE IF X CHANGES ---
        * Event names / shape    → Anthropic ``RawMessageStreamEvent``.
        * History adaptation     → ``_messages_payload`` (tool turns
          become ``user`` messages carrying a ``tool_result`` block).
        """
        system_prompt, user_messages = _split_system(messages)
        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": user_messages,
        }
        if tools:
            kwargs["tools"] = _tools_payload(tools)

        try:
            async with self._client.messages.stream(**kwargs) as stream:
                pending: dict[int, dict[str, Any]] = {}
                stop_reason: str | None = None
                async for event in stream:
                    etype = getattr(event, "type", None)
                    if etype == "content_block_start":
                        block = getattr(event, "content_block", None)
                        index = getattr(event, "index", 0)
                        if block and getattr(block, "type", None) == "tool_use":
                            pending[index] = {
                                "call_id": getattr(block, "id", "") or "",
                                "name": getattr(block, "name", "") or "",
                                "args_text": "",
                            }
                    elif etype == "content_block_delta":
                        delta = getattr(event, "delta", None)
                        if delta is None:
                            continue
                        dtype = getattr(delta, "type", None)
                        if dtype == "text_delta":
                            text = getattr(delta, "text", "") or ""
                            if text:
                                yield TextChunk(delta=text)
                        elif dtype == "input_json_delta":
                            index = getattr(event, "index", 0)
                            bucket = pending.get(index)
                            if bucket is not None:
                                bucket["args_text"] += getattr(delta, "partial_json", "") or ""
                    elif etype == "message_delta":
                        # ``delta.stop_reason`` lands here on the last
                        # frame before ``message_stop``.
                        delta = getattr(event, "delta", None)
                        if delta is not None:
                            stop_reason = getattr(delta, "stop_reason", None) or stop_reason

                for bucket in pending.values():
                    yield ToolCallChunk(
                        call_id=bucket["call_id"] or bucket["name"],
                        name=bucket["name"],
                        arguments=_parse_args(bucket["args_text"]),
                    )
                yield FinishChunk(reason=_translate_stop(stop_reason, has_calls=bool(pending)))
        except anthropic.RateLimitError as exc:
            raise ChatProviderError("Anthropic rate limit exceeded") from exc
        except anthropic.AuthenticationError as exc:
            raise ChatProviderError("Anthropic authentication failed") from exc


def _split_system(messages: list[ChatMessage]) -> tuple[Any, list[dict[str, Any]]]:
    """Separate system parts (top-level Anthropic param) from chat turns.

    Tool turns become ``user`` messages whose content is a single
    ``tool_result`` block — the Anthropic Messages API requires the
    tool answer to flow as the next user turn rather than a dedicated
    role. See https://docs.anthropic.com/en/docs/agents-and-tools/tool-use.
    """
    system_parts: list[str] = []
    out: list[dict[str, Any]] = []
    for msg in messages:
        if msg.role == "system":
            system_parts.append(msg.content)
        elif msg.role == "tool":
            out.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": msg.tool_call_id or msg.name or "tool",
                            "content": msg.content,
                        }
                    ],
                }
            )
        else:
            out.append({"role": msg.role, "content": msg.content})
    system_prompt: Any = "\n\n".join(system_parts) if system_parts else anthropic.NOT_GIVEN
    return system_prompt, out


def _tools_payload(tools: list[ToolSpec]) -> list[dict[str, Any]]:
    """Convert ``ToolSpec`` list to the Anthropic tool definition shape."""
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.parameters,
        }
        for tool in tools
    ]


def _parse_args(args_text: str) -> dict[str, Any]:
    """Best-effort parse of a buffered JSON argument blob."""
    if not args_text:
        return {}
    import json

    try:
        parsed = json.loads(args_text)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _translate_stop(reason: str | None, *, has_calls: bool) -> str:
    """Translate an Anthropic stop reason into the LexFlow vocabulary."""
    if has_calls or reason == "tool_use":
        return "tool_use"
    if reason == "max_tokens":
        return "length"
    if reason in {None, "end_turn", "stop_sequence"}:
        return "stop"
    return "error"
