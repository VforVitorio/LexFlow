"""Tests for the MCP tool-use agentic loop on the chat SSE stream (#195).

Covers:
- Default ``stream_chat_typed`` on ``ChatProvider`` wraps ``stream_chat``
  and never yields tool calls (back-compat path).
- A fake provider that yields a ``ToolCallChunk`` triggers a ``tool_call``
  SSE event, the dispatcher actually invokes the tool, the result is fed
  back into the second iteration, and the final text is streamed.
- Iteration cap (``_MAX_TOOL_ITERATIONS``): a provider that asks for
  tools forever is stopped without crashing the request.
- Tool results that look like ``search_law`` output produce ``source``
  SSE events with the right shape.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.chat.base import (
    ChatMessage,
    ChatProvider,
    FinishChunk,
    StreamChunk,
    TextChunk,
    ToolCallChunk,
    ToolSpec,
)
from lexflow.chat.streaming import _extract_citations

# ─── Unit-ish: default stream_chat_typed bridges stream_chat ────────────


class _PlainTextProvider(ChatProvider):
    """No native tool-use — exercises the inherited default."""

    def __init__(self, chunks: list[str]) -> None:
        self._chunks = chunks

    async def list_models(self) -> list[str]:
        return ["fake"]

    async def stream_chat(self, messages: list[ChatMessage], model: str) -> AsyncIterator[str]:
        for chunk in self._chunks:
            yield chunk


class TestDefaultStreamChatTyped:
    @pytest.mark.asyncio
    async def test_yields_text_chunks_then_finish_stop(self) -> None:
        provider = _PlainTextProvider(["Hola ", "mundo."])
        seen: list[StreamChunk] = []
        async for chunk in provider.stream_chat_typed([], "fake"):
            seen.append(chunk)
        assert [type(c).__name__ for c in seen] == ["TextChunk", "TextChunk", "FinishChunk"]
        assert isinstance(seen[-1], FinishChunk)
        assert seen[-1].reason == "stop"

    @pytest.mark.asyncio
    async def test_skips_empty_text_chunks(self) -> None:
        provider = _PlainTextProvider(["", "x", ""])
        seen: list[StreamChunk] = []
        async for chunk in provider.stream_chat_typed([], "fake"):
            seen.append(chunk)
        text = [c for c in seen if isinstance(c, TextChunk)]
        assert [c.delta for c in text] == ["x"]


# ─── Citation extractor ────────────────────────────────────────────────


class TestExtractCitations:
    def test_search_law_shape(self) -> None:
        result = {
            "items": [
                {"law_id": "BOE-A-1978-31229", "article_number": "18", "snippet": "..."},
                {"law_id": "BOE-A-2000-323"},
            ]
        }
        citations = _extract_citations(result)
        assert citations == [
            {"law_id": "BOE-A-1978-31229", "article_number": "18"},
            {"law_id": "BOE-A-2000-323"},
        ]

    def test_get_law_shape(self) -> None:
        result = {"metadata": {"identifier": "BOE-A-2018-16673"}, "articles": []}
        assert _extract_citations(result) == [{"law_id": "BOE-A-2018-16673"}]

    def test_empty_result_returns_empty(self) -> None:
        assert _extract_citations({}) == []
        assert _extract_citations({"error": "not_found"}) == []


# ─── End-to-end through the SSE endpoint ────────────────────────────────


class _ToolUsingProvider(ChatProvider):
    """First iteration yields a tool call; second iteration yields text.

    Captures the messages it gets called with so the test can assert the
    bridge fed the tool result back into the second call.
    """

    def __init__(self) -> None:
        self.iterations = 0
        self.observed_histories: list[list[ChatMessage]] = []

    async def list_models(self) -> list[str]:
        return ["fake"]

    async def stream_chat(self, messages: list[ChatMessage], model: str) -> AsyncIterator[str]:
        # Required by ABC; not used because we override stream_chat_typed.
        if False:
            yield ""

    async def stream_chat_typed(
        self,
        messages: list[ChatMessage],
        model: str,
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        self.iterations += 1
        self.observed_histories.append(list(messages))
        if self.iterations == 1:
            yield ToolCallChunk(call_id="c1", name="get_stats", arguments={})
            yield FinishChunk(reason="tool_use")
            return
        yield TextChunk(delta="Tienes ")
        yield TextChunk(delta="leyes.")
        yield FinishChunk(reason="stop")


class _RunawayToolProvider(ChatProvider):
    """Asks for a tool every iteration — must stop at the cap."""

    def __init__(self) -> None:
        self.iterations = 0

    async def list_models(self) -> list[str]:
        return ["fake"]

    async def stream_chat(self, messages: list[ChatMessage], model: str) -> AsyncIterator[str]:
        if False:
            yield ""

    async def stream_chat_typed(
        self,
        messages: list[ChatMessage],
        model: str,
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        self.iterations += 1
        yield ToolCallChunk(call_id=f"c{self.iterations}", name="get_stats", arguments={})
        yield FinishChunk(reason="tool_use")


@pytest.fixture()
def patch_ollama_provider(monkeypatch: MonkeyPatch):
    """Swap the ``ollama`` slot in the provider registry for a custom factory."""

    def _install(factory) -> None:
        from lexflow.chat import provider_registry as registry_mod

        spec = registry_mod.PROVIDERS_BY_KEY["ollama"]
        patched = registry_mod.ProviderSpec(
            key=spec.key,
            local=spec.local,
            factory=factory,
            default_context=spec.default_context,
            env_key=spec.env_key,
        )
        monkeypatch.setitem(registry_mod.PROVIDERS_BY_KEY, "ollama", patched)

    return _install


def _create_thread(client: TestClient) -> str:
    response = client.post(
        "/api/v1/chat/threads",
        json={"title": "tool-use", "model": "ollama:fake"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    name = ""
    data_parts: list[str] = []
    for line in body.splitlines():
        if line.startswith("event: "):
            name = line[len("event: ") :].strip()
        elif line.startswith("data: "):
            data_parts.append(line[len("data: ") :])
        elif line == "":
            if name and data_parts:
                events.append((name, json.loads("\n".join(data_parts))))
            name = ""
            data_parts = []
    return events


class TestToolUseLoopE2E:
    def test_tool_call_dispatches_and_continues(
        self,
        client: TestClient,
        patch_ollama_provider,
        mock_registry,
    ) -> None:
        provider = _ToolUsingProvider()
        patch_ollama_provider(lambda: provider)
        thread_id = _create_thread(client)
        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "¿cuántas leyes?", "model": "ollama:fake"},
        )
        assert response.status_code == 200
        events = _parse_sse(response.text)
        names = [e[0] for e in events]

        # tool_call before any text; then text deltas; then done.
        assert "tool_call" in names
        tool_call_idx = names.index("tool_call")
        text_idxs = [i for i, n in enumerate(names) if n == "text"]
        assert all(idx > tool_call_idx for idx in text_idxs)
        assert names[-1] == "done"

        # Provider was called twice (loop ran one tool round-trip).
        assert provider.iterations == 2
        # Second call's history carries the tool result as a tool message.
        second_history = provider.observed_histories[1]
        tool_messages = [m for m in second_history if m.role == "tool"]
        assert len(tool_messages) == 1
        assert tool_messages[0].tool_call_id == "c1"
        assert tool_messages[0].name == "get_stats"

    def test_runaway_loop_stops_at_iteration_cap(
        self,
        client: TestClient,
        patch_ollama_provider,
        mock_registry,
    ) -> None:
        provider = _RunawayToolProvider()
        patch_ollama_provider(lambda: provider)
        thread_id = _create_thread(client)
        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "loop!", "model": "ollama:fake"},
        )
        assert response.status_code == 200
        # The handler must return a valid SSE stream ending in ``done``,
        # not crash. Provider gets exactly 5 calls (the hard cap).
        events = _parse_sse(response.text)
        assert events[-1][0] == "done"
        assert provider.iterations == 5
