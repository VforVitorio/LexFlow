"""End-to-end: rate limiting kicks in at the route handler (#93).

Verifies the wire contract documented on the issue:

* When the bucket has capacity → ``200`` with an SSE stream.
* When the bucket is empty     → ``429`` with a ``Retry-After`` header
                                 and a JSON body carrying ``retry_after_s``.

The fake provider is registered against the OpenAI slot in
``PROVIDERS_BY_KEY`` so we never need a real API key.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.chat.rate_limit import reset_buckets


class _FakeProvider:
    async def list_models(self) -> list[str]:
        return ["fake-model"]

    async def stream_chat(self, messages: list[object], model: str) -> AsyncIterator[str]:
        yield "hello"


@pytest.fixture()
def fake_openai(monkeypatch: MonkeyPatch) -> None:
    """Swap the OpenAI provider for a fake so no real key is needed."""
    from lexflow.chat import provider_registry as registry_mod

    spec = registry_mod.PROVIDERS_BY_KEY["openai"]
    patched = registry_mod.ProviderSpec(
        key=spec.key,
        local=spec.local,
        factory=lambda: _FakeProvider(),  # type: ignore[arg-type,return-value]
        default_context=spec.default_context,
        env_key=spec.env_key,
    )
    monkeypatch.setitem(registry_mod.PROVIDERS_BY_KEY, "openai", patched)


@pytest.fixture(autouse=True)
def _clean_buckets() -> None:
    reset_buckets()


def _create_thread(client: TestClient) -> str:
    response = client.post(
        "/api/v1/chat/threads",
        json={"title": "rate-limit test", "model": "openai:fake-model"},
    )
    assert response.status_code == 201
    return response.json()["id"]


class TestRouteRateLimit:
    def test_first_call_passes_second_returns_429(
        self,
        client: TestClient,
        fake_openai: None,
        monkeypatch: MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LEXFLOW_RATE_OPENAI_RPM", "1")
        thread_id = _create_thread(client)

        first = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "hi", "model": "openai:fake-model"},
        )
        assert first.status_code == 200

        second = client.post(
            f"/api/v1/chat/threads/{thread_id}/send",
            json={"message": "hi again", "model": "openai:fake-model"},
        )
        assert second.status_code == 429
        assert "Retry-After" in second.headers
        # Retry-After is an integer seconds count per RFC 7231.
        assert second.headers["Retry-After"].isdigit()
        payload = second.json()
        assert payload["detail"]["error"] == "rate_limited"
        assert payload["detail"]["provider"] == "openai"
        assert payload["detail"]["retry_after_s"] > 0
        assert "Slow down" in payload["detail"]["message"]

    def test_local_provider_is_never_rate_limited(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
    ) -> None:
        # Set the OpenAI rate to 0 (would disable on cloud) and confirm
        # a local-provider call is unaffected.
        monkeypatch.setenv("LEXFLOW_RATE_OPENAI_RPM", "1")
        from lexflow.chat import provider_registry as registry_mod

        ollama_spec = registry_mod.PROVIDERS_BY_KEY["ollama"]
        patched = registry_mod.ProviderSpec(
            key=ollama_spec.key,
            local=ollama_spec.local,
            factory=lambda: _FakeProvider(),  # type: ignore[arg-type,return-value]
            default_context=ollama_spec.default_context,
            env_key=ollama_spec.env_key,
        )
        monkeypatch.setitem(registry_mod.PROVIDERS_BY_KEY, "ollama", patched)

        create = client.post(
            "/api/v1/chat/threads",
            json={"title": "local", "model": "ollama:fake-model"},
        )
        assert create.status_code == 201
        thread_id = create.json()["id"]

        for _ in range(5):
            resp = client.post(
                f"/api/v1/chat/threads/{thread_id}/send",
                json={"message": "hi", "model": "ollama:fake-model"},
            )
            assert resp.status_code == 200
