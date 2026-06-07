"""Native tool-use streaming tests per provider (#464).

Each SDK exposes a different wire shape for tool calls:

- OpenAI streams ``delta.tool_calls`` with JSON ``arguments`` fragments
  that we must buffer per index until ``finish_reason`` lands.
- Anthropic streams a ``tool_use`` content block whose JSON arguments
  arrive as ``input_json_delta`` events; ``message_delta.stop_reason``
  carries ``tool_use`` on completion.
- Gemini lands each ``function_call`` part fully formed inside a
  ``Candidate`` (the SDK parses the JSON for us); ``finish_reason``
  rides on the candidate.

For each provider we assert:

1. Text deltas surface as ``TextChunk``.
2. A tool call surfaces as ``ToolCallChunk`` with parsed arguments.
3. ``FinishChunk.reason == "tool_use"`` when a call was emitted.
4. The history adapter folds ``tool`` turns into the SDK-specific
   shape (OpenAI ``tool_call_id``, Anthropic ``tool_result`` user
   block, Gemini ``function`` role).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, ClassVar

import pytest
from pytest import MonkeyPatch

from lexflow.chat.base import (
    ChatMessage,
    FinishChunk,
    StreamChunk,
    TextChunk,
    ToolCallChunk,
    ToolSpec,
)

_SEARCH_TOOL = ToolSpec(
    name="search_law",
    description="Search corpus",
    parameters={
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    },
)


async def _drain(stream: AsyncIterator[StreamChunk]) -> list[StreamChunk]:
    out: list[StreamChunk] = []
    async for chunk in stream:
        out.append(chunk)
    return out


# ─── OpenAI ─────────────────────────────────────────────────────────────


class _OpenAIDelta:
    def __init__(
        self,
        *,
        content: str | None = None,
        tool_calls: list[Any] | None = None,
    ) -> None:
        self.content = content
        self.tool_calls = tool_calls


class _OpenAIChoice:
    def __init__(self, delta: _OpenAIDelta, finish_reason: str | None = None) -> None:
        self.delta = delta
        self.finish_reason = finish_reason


class _OpenAIChunk:
    def __init__(self, choice: _OpenAIChoice) -> None:
        self.choices = [choice]


class _ToolCallDelta:
    def __init__(
        self,
        *,
        index: int,
        call_id: str | None = None,
        name: str | None = None,
        arguments: str | None = None,
    ) -> None:
        self.index = index
        self.id = call_id
        self.function = _Function(name=name, arguments=arguments)


class _Function:
    def __init__(self, *, name: str | None, arguments: str | None) -> None:
        self.name = name
        self.arguments = arguments


class _FakeOpenAIStream:
    chunks: ClassVar[list[_OpenAIChunk]] = []

    def __aiter__(self) -> _FakeOpenAIStream:
        self._idx = 0
        return self

    async def __anext__(self) -> _OpenAIChunk:
        if self._idx >= len(self.chunks):
            raise StopAsyncIteration
        chunk = self.chunks[self._idx]
        self._idx += 1
        return chunk


class _FakeOpenAICompletions:
    captured: ClassVar[dict[str, Any]] = {}

    async def create(self, **kwargs: Any) -> _FakeOpenAIStream:
        type(self).captured.clear()
        type(self).captured.update(kwargs)
        return _FakeOpenAIStream()


class _FakeOpenAIChat:
    def __init__(self) -> None:
        self.completions = _FakeOpenAICompletions()


class _FakeOpenAIClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs
        self.chat = _FakeOpenAIChat()


class TestOpenAITypedStreaming:
    @pytest.mark.asyncio
    async def test_emits_tool_call_with_parsed_args(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import openai_provider as openai_mod

        _FakeOpenAIStream.chunks = [
            _OpenAIChunk(_OpenAIChoice(_OpenAIDelta(content="Voy a buscar "))),
            _OpenAIChunk(
                _OpenAIChoice(
                    _OpenAIDelta(
                        tool_calls=[
                            _ToolCallDelta(
                                index=0,
                                call_id="call_1",
                                name="search_law",
                                arguments='{"query":',
                            )
                        ]
                    )
                )
            ),
            _OpenAIChunk(
                _OpenAIChoice(_OpenAIDelta(tool_calls=[_ToolCallDelta(index=0, arguments='"protección de datos"}')]))
            ),
            _OpenAIChunk(_OpenAIChoice(_OpenAIDelta(), finish_reason="tool_calls")),
        ]
        monkeypatch.setattr(openai_mod.openai, "AsyncOpenAI", _FakeOpenAIClient)
        provider = openai_mod.OpenAIProvider(api_key="sk-test")

        chunks = await _drain(
            provider.stream_chat_typed(
                [ChatMessage(role="user", content="?")],
                "gpt-4o",
                tools=[_SEARCH_TOOL],
            )
        )

        text_deltas = [c.delta for c in chunks if isinstance(c, TextChunk)]
        tool_calls = [c for c in chunks if isinstance(c, ToolCallChunk)]
        finishes = [c for c in chunks if isinstance(c, FinishChunk)]
        assert text_deltas == ["Voy a buscar "]
        assert len(tool_calls) == 1
        assert tool_calls[0].name == "search_law"
        assert tool_calls[0].call_id == "call_1"
        assert tool_calls[0].arguments == {"query": "protección de datos"}
        assert finishes == [FinishChunk(reason="tool_use")]
        # Tools payload was forwarded with ``type=function`` shape.
        assert _FakeOpenAICompletions.captured["tools"][0]["type"] == "function"
        assert _FakeOpenAICompletions.captured["tool_choice"] == "auto"

    @pytest.mark.asyncio
    async def test_tool_history_carries_tool_call_id(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import openai_provider as openai_mod

        _FakeOpenAIStream.chunks = [_OpenAIChunk(_OpenAIChoice(_OpenAIDelta(content="done"), finish_reason="stop"))]
        monkeypatch.setattr(openai_mod.openai, "AsyncOpenAI", _FakeOpenAIClient)
        provider = openai_mod.OpenAIProvider(api_key="sk-test")
        await _drain(
            provider.stream_chat_typed(
                [
                    ChatMessage(role="user", content="hi"),
                    ChatMessage(
                        role="tool",
                        content='{"items":[]}',
                        tool_call_id="call_42",
                        name="search_law",
                    ),
                ],
                "gpt-4o",
            )
        )
        tool_turn = next(m for m in _FakeOpenAICompletions.captured["messages"] if m["role"] == "tool")
        assert tool_turn["tool_call_id"] == "call_42"
        assert tool_turn["content"] == '{"items":[]}'


# ─── Anthropic ──────────────────────────────────────────────────────────


class _AnthropicEvent:
    def __init__(self, type_: str, **kwargs: Any) -> None:
        self.type = type_
        for k, v in kwargs.items():
            setattr(self, k, v)


class _AnthropicBlock:
    def __init__(self, type_: str, **kwargs: Any) -> None:
        self.type = type_
        for k, v in kwargs.items():
            setattr(self, k, v)


class _AnthropicDelta:
    def __init__(self, type_: str | None = None, **kwargs: Any) -> None:
        self.type = type_
        for k, v in kwargs.items():
            setattr(self, k, v)


class _FakeAnthropicStream:
    events: ClassVar[list[_AnthropicEvent]] = []

    async def __aenter__(self) -> _FakeAnthropicStream:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    def __aiter__(self) -> _FakeAnthropicStream:
        self._idx = 0
        return self

    async def __anext__(self) -> _AnthropicEvent:
        if self._idx >= len(self.events):
            raise StopAsyncIteration
        event = self.events[self._idx]
        self._idx += 1
        return event


class _FakeAnthropicMessages:
    captured: ClassVar[dict[str, Any]] = {}

    def stream(self, **kwargs: Any) -> _FakeAnthropicStream:
        type(self).captured.clear()
        type(self).captured.update(kwargs)
        return _FakeAnthropicStream()


class _FakeAnthropicClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs
        self.messages = _FakeAnthropicMessages()


class TestAnthropicTypedStreaming:
    @pytest.mark.asyncio
    async def test_emits_tool_use_with_buffered_args(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import anthropic_provider as anthropic_mod

        _FakeAnthropicStream.events = [
            _AnthropicEvent(
                "content_block_start",
                index=0,
                content_block=_AnthropicBlock("text"),
            ),
            _AnthropicEvent(
                "content_block_delta",
                index=0,
                delta=_AnthropicDelta("text_delta", text="Voy a buscar."),
            ),
            _AnthropicEvent(
                "content_block_start",
                index=1,
                content_block=_AnthropicBlock("tool_use", id="toolu_1", name="search_law"),
            ),
            _AnthropicEvent(
                "content_block_delta",
                index=1,
                delta=_AnthropicDelta("input_json_delta", partial_json='{"query":'),
            ),
            _AnthropicEvent(
                "content_block_delta",
                index=1,
                delta=_AnthropicDelta("input_json_delta", partial_json='"GDPR"}'),
            ),
            _AnthropicEvent(
                "message_delta",
                delta=_AnthropicDelta(stop_reason="tool_use"),
            ),
        ]
        monkeypatch.setattr(anthropic_mod.anthropic, "AsyncAnthropic", _FakeAnthropicClient)
        provider = anthropic_mod.AnthropicProvider(api_key="sk-test")

        chunks = await _drain(
            provider.stream_chat_typed(
                [ChatMessage(role="user", content="?")],
                "claude-sonnet-4-6",
                tools=[_SEARCH_TOOL],
            )
        )

        text_deltas = [c.delta for c in chunks if isinstance(c, TextChunk)]
        tool_calls = [c for c in chunks if isinstance(c, ToolCallChunk)]
        finishes = [c for c in chunks if isinstance(c, FinishChunk)]
        assert text_deltas == ["Voy a buscar."]
        assert len(tool_calls) == 1
        assert tool_calls[0].name == "search_law"
        assert tool_calls[0].call_id == "toolu_1"
        assert tool_calls[0].arguments == {"query": "GDPR"}
        assert finishes == [FinishChunk(reason="tool_use")]
        assert _FakeAnthropicMessages.captured["tools"][0]["input_schema"] == _SEARCH_TOOL.parameters

    @pytest.mark.asyncio
    async def test_tool_history_becomes_user_tool_result_block(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import anthropic_provider as anthropic_mod

        _FakeAnthropicStream.events = []
        monkeypatch.setattr(anthropic_mod.anthropic, "AsyncAnthropic", _FakeAnthropicClient)
        provider = anthropic_mod.AnthropicProvider(api_key="sk-test")
        await _drain(
            provider.stream_chat_typed(
                [
                    ChatMessage(role="user", content="hi"),
                    ChatMessage(
                        role="tool",
                        content='{"items":[]}',
                        tool_call_id="toolu_7",
                        name="search_law",
                    ),
                ],
                "claude-sonnet-4-6",
            )
        )
        history = _FakeAnthropicMessages.captured["messages"]
        tool_msg = history[-1]
        assert tool_msg["role"] == "user"
        assert tool_msg["content"][0]["type"] == "tool_result"
        assert tool_msg["content"][0]["tool_use_id"] == "toolu_7"
        assert tool_msg["content"][0]["content"] == '{"items":[]}'


# ─── Google Gemini ──────────────────────────────────────────────────────


class _GooglePart:
    def __init__(
        self,
        *,
        text: str | None = None,
        function_call: Any = None,
    ) -> None:
        self.text = text
        self.function_call = function_call


class _GoogleFunctionCall:
    def __init__(self, *, name: str, args: dict[str, Any]) -> None:
        self.name = name
        self.args = args


class _GoogleContent:
    def __init__(self, parts: list[_GooglePart]) -> None:
        self.parts = parts


class _GoogleCandidate:
    def __init__(
        self,
        *,
        parts: list[_GooglePart] | None = None,
        finish_reason: str | None = None,
    ) -> None:
        self.content = _GoogleContent(parts or [])
        self.finish_reason = finish_reason


class _GoogleStreamChunk:
    def __init__(self, candidate: _GoogleCandidate) -> None:
        self.candidates = [candidate]


class _FakeGoogleStream:
    chunks: ClassVar[list[_GoogleStreamChunk]] = []

    def __aiter__(self) -> _FakeGoogleStream:
        self._idx = 0
        return self

    async def __anext__(self) -> _GoogleStreamChunk:
        if self._idx >= len(self.chunks):
            raise StopAsyncIteration
        chunk = self.chunks[self._idx]
        self._idx += 1
        return chunk


class _FakeGoogleModels:
    captured: ClassVar[dict[str, Any]] = {}

    async def generate_content_stream(self, **kwargs: Any) -> _FakeGoogleStream:
        type(self).captured.clear()
        type(self).captured.update(kwargs)
        return _FakeGoogleStream()


class _FakeGoogleAio:
    def __init__(self) -> None:
        self.models = _FakeGoogleModels()


class _FakeGoogleClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs
        self.aio = _FakeGoogleAio()


class TestGoogleTypedStreaming:
    @pytest.mark.asyncio
    async def test_emits_function_call_parts(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import google_provider as google_mod

        _FakeGoogleStream.chunks = [
            _GoogleStreamChunk(_GoogleCandidate(parts=[_GooglePart(text="Buscando.")])),
            _GoogleStreamChunk(
                _GoogleCandidate(
                    parts=[
                        _GooglePart(
                            function_call=_GoogleFunctionCall(
                                name="search_law",
                                args={"query": "GDPR"},
                            )
                        )
                    ],
                    finish_reason="STOP",
                )
            ),
        ]
        monkeypatch.setattr(google_mod.genai, "Client", _FakeGoogleClient)
        provider = google_mod.GoogleProvider(api_key="sk-test")

        chunks = await _drain(
            provider.stream_chat_typed(
                [ChatMessage(role="user", content="?")],
                "gemini-2.0-flash",
                tools=[_SEARCH_TOOL],
            )
        )

        text_deltas = [c.delta for c in chunks if isinstance(c, TextChunk)]
        tool_calls = [c for c in chunks if isinstance(c, ToolCallChunk)]
        finishes = [c for c in chunks if isinstance(c, FinishChunk)]
        assert text_deltas == ["Buscando."]
        assert len(tool_calls) == 1
        assert tool_calls[0].name == "search_law"
        assert tool_calls[0].arguments == {"query": "GDPR"}
        # Any tool call must flip the finish reason to ``tool_use`` even
        # if the SDK reported ``STOP`` (Gemini emits ``STOP`` when it's
        # done with the turn but still has a call queued).
        assert finishes == [FinishChunk(reason="tool_use")]
        cfg = _FakeGoogleModels.captured["config"]
        assert cfg["tools"][0]["function_declarations"][0]["name"] == "search_law"

    @pytest.mark.asyncio
    async def test_tool_history_becomes_function_response(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import google_provider as google_mod

        _FakeGoogleStream.chunks = []
        monkeypatch.setattr(google_mod.genai, "Client", _FakeGoogleClient)
        provider = google_mod.GoogleProvider(api_key="sk-test")
        await _drain(
            provider.stream_chat_typed(
                [
                    ChatMessage(role="user", content="hi"),
                    ChatMessage(
                        role="tool",
                        content='{"items":[]}',
                        tool_call_id="search_law",
                        name="search_law",
                    ),
                ],
                "gemini-2.0-flash",
            )
        )
        contents = _FakeGoogleModels.captured["contents"]
        tool_msg = contents[-1]
        assert tool_msg["role"] == "function"
        part = tool_msg["parts"][0]
        assert part["function_response"]["name"] == "search_law"
        assert part["function_response"]["response"] == {"items": []}
