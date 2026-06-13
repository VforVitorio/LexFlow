"""Integration tests for ``POST /api/v1/chat/threads/{id}/send`` (SSE) — #573.

The chat reply is streamed as Server-Sent Events; "the chat doesn't render"
was a live walkthrough bug, and the endpoint had no test. These drive the
real FastAPI route with a fake :class:`ChatProvider` injected through
``provider_registry.PROVIDERS_BY_KEY`` (the documented monkeypatch seam in
``lexflow.chat.streaming._provider_for``), so no LLM/daemon is needed.

Covered:
* happy path — provider chunks arrive as ``text`` events, terminated by
  ``done``, and the assistant turn is persisted (visible via the thread
  preview);
* provider failure mid-stream — the partial text is still emitted and an
  ``error`` event precedes the final ``done``.

A local provider key (``ollama``) is used so the pre-stream rate-limit gate
passes through (cloud keys would need a budget).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.chat import provider_registry
from lexflow.chat.base import ChatProviderError, FinishChunk, TextChunk


class _FakeProvider:
    """Yields the given text deltas, then either finishes or raises.

    Only ``stream_chat_typed`` is exercised by ``stream_chat_reply``; the
    other ``ChatProvider`` methods are never called, so we don't implement
    them (duck-typed on purpose).
    """

    def __init__(self, deltas: list[str], error: Exception | None = None) -> None:
        self._deltas = deltas
        self._error = error

    async def stream_chat_typed(self, messages: Any, model: str, tools: Any = None) -> Any:
        for delta in self._deltas:
            yield TextChunk(delta=delta)
        if self._error is not None:
            raise self._error
        yield FinishChunk(reason="stop")


def _inject_provider(monkeypatch: MonkeyPatch, provider: _FakeProvider) -> None:
    """Point the ``ollama`` registry key at our fake (local key → no rate limit)."""
    monkeypatch.setitem(
        provider_registry.PROVIDERS_BY_KEY,
        "ollama",
        SimpleNamespace(factory=lambda: provider),
    )


def _create_thread(client: TestClient) -> str:
    response = client.post("/api/v1/chat/threads", json={"title": "T"})
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


class TestChatStream:
    def test_streams_text_events_then_done_and_persists(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        _inject_provider(monkeypatch, _FakeProvider(["Hola ", "mundo."]))
        thread_id = _create_thread(client)

        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "¿Saludas?", "model": "ollama:fake-model"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        body = response.text
        # Each provider chunk is its own `text` event, terminated by `done`.
        assert '"delta":"Hola "' in body
        assert '"delta":"mundo."' in body
        assert "event: done" in body
        assert body.index("event: text") < body.index("event: done")

        # The assistant turn was persisted — the thread preview reflects it.
        preview = client.get(f"/api/v1/chat/threads/{thread_id}").json()["preview"]
        assert preview is not None
        assert "mundo." in preview

    def test_provider_failure_emits_error_then_done(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        # Yields one partial chunk, then fails. The message avoids the
        # "does not support tools" phrase so it surfaces instead of triggering
        # the tool-less retry path.
        _inject_provider(
            monkeypatch,
            _FakeProvider(["Pensando… "], error=ChatProviderError("upstream exploded")),
        )
        thread_id = _create_thread(client)

        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "Hola", "model": "ollama:fake-model"},
        )
        assert response.status_code == 200
        body = response.text
        assert '"delta":"Pensando… "' in body
        assert "event: error" in body
        assert "event: done" in body
        assert body.index("event: error") < body.index("event: done")
