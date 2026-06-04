"""Base interface for all LexFlow chat providers.

The classic ``stream_chat`` yields plain text chunks. The newer
``stream_chat_typed`` (#195) yields a typed union — ``TextChunk`` /
``ToolCallChunk`` / ``FinishChunk`` — so the agentic streaming bridge
in :mod:`lexflow.chat.streaming` can react to tool-use deltas without
parsing free-form text.

Providers that don't yet implement native tool-use (Ollama early
versions, the test fakes) inherit a default ``stream_chat_typed`` that
wraps their text-only ``stream_chat``. That keeps the bridge generic:
the loop iterates over the union, dispatches tool calls when present,
and falls back to streaming text otherwise.

--- WHERE TO CHANGE IF A NEW EVENT TYPE LANDS ---
* Add a new chunk model below.
* Add it to the ``StreamChunk`` union.
* Teach the bridge in ``streaming.py`` how to react to it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any, Literal

from pydantic import BaseModel


class ChatProviderError(Exception):
    """Raised when a chat provider encounters an error."""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "system" | "tool"
    content: str
    # Optional ergonomic hooks for the agentic loop. ``tool_call_id``
    # threads a tool result back to the call it answers; ``name`` lets
    # provider adapters surface the source tool when relevant.
    tool_call_id: str | None = None
    name: str | None = None


# ─── Typed stream chunks (#195) ─────────────────────────────────────────


class TextChunk(BaseModel):
    """A piece of plain assistant text."""

    type: Literal["text"] = "text"
    delta: str


class ToolCallChunk(BaseModel):
    """The model wants to invoke a tool.

    Args is the parsed arguments dict — providers that stream arguments
    incrementally (OpenAI emits JSON fragments) are expected to buffer
    them in their adapter and only yield this chunk once the args are
    complete.
    """

    type: Literal["tool_call"] = "tool_call"
    call_id: str
    name: str
    arguments: dict[str, Any]


class FinishChunk(BaseModel):
    """The provider has finished this turn.

    ``reason`` follows OpenAI's vocabulary — ``stop`` (normal end),
    ``tool_use`` (yielded a tool call and is awaiting result),
    ``length`` (token cap hit), ``error`` (SDK error). The bridge keys
    its loop decision off this.
    """

    type: Literal["finish"] = "finish"
    reason: Literal["stop", "tool_use", "length", "error"]


# Discriminated union — the bridge ``match``es on ``type`` (or
# ``isinstance``) to dispatch.
StreamChunk = TextChunk | ToolCallChunk | FinishChunk


class ToolSpec(BaseModel):
    """A tool exposed to the provider for native function-calling.

    ``parameters`` is a JSON-schema dict matching the provider's
    expected shape (OpenAI / Anthropic / Google all converge on JSON
    schema for tool argument typing).
    """

    name: str
    description: str
    parameters: dict[str, Any]


# ─── Provider interface ─────────────────────────────────────────────────


class ChatProvider(ABC):
    """All providers (Ollama / OpenAI / Anthropic / Google / LM Studio)
    inherit from this.

    Two streaming surfaces:

    * ``stream_chat`` — legacy text-only, kept stable so today's chat
      consumer keeps working unchanged.
    * ``stream_chat_typed`` — new typed surface (#195). Default impl
      bridges ``stream_chat`` so any provider that hasn't been updated
      yet still works through the agentic loop (it just never yields
      tool calls).
    """

    @abstractmethod
    async def list_models(self) -> list[str]: ...

    @abstractmethod
    def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncIterator[str]: ...

    async def stream_chat_typed(
        self,
        messages: list[ChatMessage],
        model: str,
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Default: wrap ``stream_chat`` as a stream of ``TextChunk``.

        Provider subclasses that support native tool-use SHOULD override
        this. The default never yields a ``ToolCallChunk`` — passing
        ``tools`` here is effectively a no-op for unsupported providers.
        """
        # ``tools`` is accepted for API parity; the default impl can't
        # honour it. Subclasses are expected to wire it into the SDK.
        del tools
        async for delta in self.stream_chat(messages, model):
            if delta:
                yield TextChunk(delta=delta)
        yield FinishChunk(reason="stop")
