"""Tests for the SSE streaming endpoint (issue #84).

Monkeypatches the provider factories so the suite doesn't need real
Ollama / cloud creds. Verifies:

* the wire format (``event:`` / ``data:`` framing, JSON payloads);
* both the user and the assistant turn land in the DB;
* the thread's ``updated_at`` moves so the conversation rail reorders;
* provider failures emit ``error`` then ``done`` without losing partial
  content;
* unknown ``provider:model`` ids emit ``error`` + ``done`` (no crash).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.chat.base import ChatProvider, ChatProviderError


class _FakeProvider(ChatProvider):
    """Yields a canned sequence of text chunks.

    ``chunks`` may include ``ChatProviderError(...)`` instances — when
    the generator hits one, it raises instead of yielding. Lets a single
    fixture exercise both happy-path and mid-stream-failure cases.

    Subclasses :class:`ChatProvider` so the default
    ``stream_chat_typed`` (#195) bridges this text-only fake into the
    agentic loop — same behaviour as before, no tool calls ever.
    """

    def __init__(self, chunks: list[str | Exception]) -> None:
        self._chunks = chunks

    async def list_models(self) -> list[str]:
        return ["fake-model"]

    async def stream_chat(self, messages: list[object], model: str) -> AsyncIterator[str]:  # type: ignore[override]
        for chunk in self._chunks:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk


@pytest.fixture()
def patch_provider(monkeypatch: MonkeyPatch):
    """Install a fake "ollama" provider that yields the given chunks."""

    def _install(chunks: list[str | Exception]) -> None:
        from lexflow.chat import provider_registry as registry_mod

        def factory() -> _FakeProvider:
            return _FakeProvider(chunks)

        # Swap only the "ollama" slot in the shared registry. The endpoint
        # reads through ``PROVIDERS_BY_KEY``, so this is the single point
        # both ``/api/v1/models`` and ``stream_chat_reply`` use.
        ollama_spec = registry_mod.PROVIDERS_BY_KEY["ollama"]
        patched = registry_mod.ProviderSpec(
            key=ollama_spec.key,
            local=ollama_spec.local,
            factory=factory,  # type: ignore[arg-type]
            default_context=ollama_spec.default_context,
            env_key=ollama_spec.env_key,
        )
        monkeypatch.setitem(registry_mod.PROVIDERS_BY_KEY, "ollama", patched)

    return _install


def _create_thread(client: TestClient) -> str:
    response = client.post("/api/v1/chat/threads", json={"title": "test", "model": "ollama:fake-model"})
    assert response.status_code == 201
    return response.json()["id"]


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    """Tiny SSE parser. Returns (event_name, payload_dict) tuples."""
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


class TestChatStreaming:
    def test_happy_path_emits_text_then_done(
        self,
        client: TestClient,
        patch_provider,
    ) -> None:
        patch_provider(["Hola ", "mundo."])
        thread_id = _create_thread(client)
        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "¿Qué tal?", "model": "ollama:fake-model"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        events = _parse_sse(response.text)
        assert [name for name, _ in events] == ["text", "text", "done"]
        assert events[0][1] == {"delta": "Hola "}
        assert events[1][1] == {"delta": "mundo."}
        assert events[2][1] == {}

    def test_user_and_assistant_persisted(
        self,
        client: TestClient,
        patch_provider,
    ) -> None:
        patch_provider(["Hola ", "mundo."])
        thread_id = _create_thread(client)
        client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "¿Qué tal?", "model": "ollama:fake-model"},
        )
        detail = client.get(f"/api/v1/chat/threads/{thread_id}").json()
        roles = [m["role"] for m in detail["messages"]]
        contents = [m["content"] for m in detail["messages"]]
        assert roles == ["user", "assistant"]
        assert contents == ["¿Qué tal?", "Hola mundo."]

    def test_thread_updated_at_moves(
        self,
        client: TestClient,
        patch_provider,
    ) -> None:
        patch_provider(["x"])
        thread_id = _create_thread(client)
        before = client.get(f"/api/v1/chat/threads/{thread_id}").json()["updated_at"]
        client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "hi", "model": "ollama:fake-model"},
        )
        after = client.get(f"/api/v1/chat/threads/{thread_id}").json()["updated_at"]
        assert after >= before  # SQLite resolves to microseconds; equal-or-newer is enough

    def test_provider_error_mid_stream_emits_error_event(
        self,
        client: TestClient,
        patch_provider,
    ) -> None:
        patch_provider(["partial ", ChatProviderError("upstream blew up")])
        thread_id = _create_thread(client)
        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "?", "model": "ollama:fake-model"},
        )
        assert response.status_code == 200
        events = _parse_sse(response.text)
        names = [name for name, _ in events]
        assert names == ["text", "error", "done"]
        assert events[1][1] == {"detail": "upstream blew up"}

        # Partial assistant content still persisted so the user can see
        # what made it through before the failure.
        detail = client.get(f"/api/v1/chat/threads/{thread_id}").json()
        assistant = detail["messages"][-1]
        assert assistant["role"] == "assistant"
        assert assistant["content"] == "partial "

    def test_unknown_provider_errors_cleanly(
        self,
        client: TestClient,
    ) -> None:
        thread_id = _create_thread(client)
        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "hi", "model": "nope:nope"},
        )
        assert response.status_code == 200
        events = _parse_sse(response.text)
        names = [name for name, _ in events]
        assert names == ["error", "done"]
        assert "Unknown chat provider" in events[0][1]["detail"]

    def test_malformed_model_id_errors_cleanly(
        self,
        client: TestClient,
    ) -> None:
        thread_id = _create_thread(client)
        response = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "hi", "model": "missing-colon"},
        )
        assert response.status_code == 200
        events = _parse_sse(response.text)
        assert events[0][0] == "error"
        assert events[-1][0] == "done"

    def test_send_404_for_unknown_thread(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/chat/threads/missing/send",
            json={"message": "hi", "model": "ollama:fake-model"},
        )
        assert response.status_code == 404
