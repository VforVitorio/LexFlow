"""Tests for ``POST /api/v1/models/pull`` (#119).

The endpoint streams an Ollama pull as SSE. These tests patch
``ollama.AsyncClient.pull`` so the suite doesn't need a real daemon —
we feed mock ``ProgressResponse``-shaped objects and assert the wire
format the SPA's wizard step 3 will consume.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.api.routers import models as models_router


@dataclass
class _Progress:
    """Stand-in for ``ollama._types.ProgressResponse``."""

    status: str | None = None
    completed: int | None = None
    total: int | None = None
    digest: str | None = None


def _install_pull(monkeypatch: MonkeyPatch, sequence: list[Any] | Exception) -> None:
    """Replace ``ollama.AsyncClient.pull`` with a controllable fake.

    ``sequence`` may be a list of items to yield (each becomes one
    progress event), or an exception class/instance to raise on iteration.
    """

    async def fake_pull(self: Any, model: str, *, stream: bool = False) -> Any:
        async def _gen() -> AsyncIterator[Any]:
            if isinstance(sequence, Exception):
                raise sequence
            for item in sequence:
                yield item

        return _gen()

    monkeypatch.setattr(models_router.ollama.AsyncClient, "pull", fake_pull)


def _parse_sse(body: str) -> list[tuple[str, str]]:
    """Split an SSE body into ``[(event, data_json), ...]`` tuples."""
    events: list[tuple[str, str]] = []
    current_event: str | None = None
    current_data: list[str] = []
    for line in body.split("\n"):
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ").strip()
        elif line.startswith("data: "):
            current_data.append(line.removeprefix("data: "))
        elif line == "":
            if current_event is not None:
                events.append((current_event, "\n".join(current_data)))
            current_event = None
            current_data = []
    return events


class TestPullValidation:
    def test_rejects_empty_model(self, client: TestClient) -> None:
        response = client.post("/api/v1/models/pull", json={"model": ""})
        assert response.status_code == 422

    def test_rejects_model_with_whitespace(self, client: TestClient) -> None:
        response = client.post("/api/v1/models/pull", json={"model": "qwen2.5 7b"})
        assert response.status_code == 422

    def test_rejects_model_with_shell_metachars(self, client: TestClient) -> None:
        response = client.post("/api/v1/models/pull", json={"model": "qwen2.5;rm -rf /"})
        assert response.status_code == 422

    def test_accepts_plain_name(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        _install_pull(monkeypatch, [])
        response = client.post("/api/v1/models/pull", json={"model": "llama3.2"})
        assert response.status_code == 200

    def test_accepts_name_with_tag(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        _install_pull(monkeypatch, [])
        response = client.post("/api/v1/models/pull", json={"model": "qwen2.5:7b"})
        assert response.status_code == 200


class TestPullStream:
    def test_emits_progress_then_done(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        _install_pull(
            monkeypatch,
            [
                _Progress(status="pulling manifest"),
                _Progress(status="pulling 1234abcd", completed=500, total=4500, digest="sha256:abcd"),
                _Progress(status="verifying sha256 digest"),
            ],
        )
        response = client.post("/api/v1/models/pull", json={"model": "qwen2.5:7b"})
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        events = _parse_sse(response.text)
        # 3 progress + 1 done
        assert [e[0] for e in events] == ["progress", "progress", "progress", "done"]
        # The done event carries the model tag we requested.
        import json

        done_payload = json.loads(events[-1][1])
        assert done_payload == {"model": "qwen2.5:7b"}
        # Progress events carry the four expected fields.
        first = json.loads(events[0][1])
        assert set(first.keys()) == {"status", "completed", "total", "digest"}

    def test_ollama_response_error_emits_structured_error(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        import ollama as ollama_mod

        exc = ollama_mod.ResponseError("model not found")
        # ResponseError carries an `.error` attribute; the constructor signature
        # accepts (message, status_code=None) and sets self.error.
        _install_pull(monkeypatch, exc)
        response = client.post("/api/v1/models/pull", json={"model": "totally-fake:abc"})
        assert response.status_code == 200
        events = _parse_sse(response.text)
        assert events[-1][0] == "error"
        import json

        payload = json.loads(events[-1][1])
        assert payload["code"] == "ollama_pull_failed"
        # The provider message is forwarded — we only filter stack traces.
        assert "model not found" in payload["message"]

    def test_unreachable_daemon_emits_generic_error(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        _install_pull(monkeypatch, ConnectionRefusedError("nope"))
        response = client.post("/api/v1/models/pull", json={"model": "llama3.2"})
        assert response.status_code == 200
        events = _parse_sse(response.text)
        assert events[-1][0] == "error"
        import json

        payload = json.loads(events[-1][1])
        assert payload["code"] == "ollama_pull_unreachable"
        # The raw exception message must NOT leak to the client.
        assert "nope" not in payload["message"]

    def test_no_done_event_when_error_terminates_stream(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        _install_pull(monkeypatch, ConnectionRefusedError("nope"))
        response = client.post("/api/v1/models/pull", json={"model": "llama3.2"})
        events = _parse_sse(response.text)
        kinds = [e[0] for e in events]
        assert "done" not in kinds
        assert kinds.count("error") == 1


@pytest.fixture(name="client")
def _client() -> TestClient:
    """Standalone client — avoids the conftest mock_registry coupling."""
    from lexflow.api.app import app

    return TestClient(app)
