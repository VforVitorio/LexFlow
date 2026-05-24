"""Tests for ``GET /api/v1/models``.

Patches each chat provider so the suite doesn't need a real Ollama server
or cloud API keys. Asserts the endpoint shape, that probe failures degrade
to a ``configured: false`` placeholder instead of a 5xx, and that local
providers (Ollama / LM Studio) keep showing up even when the cloud
provider env keys are unset.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch


@pytest.fixture(autouse=True)
def _clear_cloud_keys(monkeypatch: MonkeyPatch) -> Iterator[None]:
    """Force a clean slate so tests don't inherit a developer's real keys."""
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    yield


class TestModelsEndpoint:
    def test_returns_a_list(self, client: TestClient) -> None:
        response = client.get("/api/v1/models")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)

    def test_unconfigured_cloud_providers_become_placeholders(self, client: TestClient) -> None:
        """Without API keys the cloud providers still show up — as placeholders."""
        response = client.get("/api/v1/models")
        body = response.json()
        cloud = {p: [m for m in body if m["provider"] == p] for p in ("openai", "anthropic", "google")}
        for provider, entries in cloud.items():
            assert entries, f"missing placeholder for {provider}"
            assert all(m["configured"] is False for m in entries), provider
            assert all(m["model"] == "" for m in entries), provider
            assert all(m["local"] is False for m in entries), provider

    def test_local_providers_are_probed(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
    ) -> None:
        """When Ollama returns a list, the endpoint surfaces each model."""
        from lexflow.chat.providers import ollama as ollama_mod

        class _FakeOllama:
            def __init__(self, *args: object, **kwargs: object) -> None: ...

            async def list_models(self) -> list[str]:
                return ["llama3.1:8b", "mistral:7b"]

        monkeypatch.setattr(ollama_mod, "OllamaProvider", _FakeOllama)
        # Re-bind the symbol the router imported at module load time.
        from lexflow.api.routers import models as router_mod

        old = router_mod._PROVIDERS[0]  # ollama is the first entry
        monkeypatch.setattr(
            router_mod,
            "_PROVIDERS",
            [
                router_mod._ProviderSpec(
                    "ollama",
                    local=old.local,
                    factory=_FakeOllama,  # type: ignore[arg-type]
                    default_context=old.default_context,
                ),
                *router_mod._PROVIDERS[1:],
            ],
        )

        body = client.get("/api/v1/models").json()
        ollama_entries = [m for m in body if m["provider"] == "ollama"]
        assert len(ollama_entries) == 2
        assert {m["model"] for m in ollama_entries} == {"llama3.1:8b", "mistral:7b"}
        assert all(m["configured"] is True for m in ollama_entries)
        assert all(m["local"] is True for m in ollama_entries)
        assert all(m["id"].startswith("ollama:") for m in ollama_entries)

    def test_probe_timeout_returns_placeholder(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
    ) -> None:
        """A hanging provider is capped by ``_PROBE_TIMEOUT_S`` and degrades."""
        import asyncio

        from lexflow.api.routers import models as router_mod

        class _HangingProvider:
            def __init__(self, *args: object, **kwargs: object) -> None: ...

            async def list_models(self) -> list[str]:
                await asyncio.sleep(60)
                return []

        # Squash the timeout so we don't wait 2s per test invocation.
        monkeypatch.setattr(router_mod, "_PROBE_TIMEOUT_S", 0.05)
        monkeypatch.setattr(
            router_mod,
            "_PROVIDERS",
            [
                router_mod._ProviderSpec(
                    "ollama",
                    local=True,
                    factory=_HangingProvider,  # type: ignore[arg-type]
                    default_context=8192,
                ),
            ],
        )
        body = client.get("/api/v1/models").json()
        assert body == [
            {
                "id": "ollama:",
                "provider": "ollama",
                "model": "",
                "local": True,
                "configured": False,
                "context_window": None,
                "error": "Probe timed out",
            }
        ]

    def test_context_window_heuristics(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
    ) -> None:
        """A configured OpenAI provider exposes gpt-4o at 128k."""
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

        from lexflow.api.routers import models as router_mod

        class _FakeOpenAI:
            def __init__(self, *args: object, **kwargs: object) -> None: ...

            async def list_models(self) -> list[str]:
                return ["gpt-4o", "gpt-3.5-turbo"]

        # Patch only the openai slot in the providers list.
        replaced: list[router_mod._ProviderSpec] = []
        for spec in router_mod._PROVIDERS:
            if spec.key == "openai":
                replaced.append(
                    router_mod._ProviderSpec(
                        "openai",
                        local=False,
                        factory=_FakeOpenAI,  # type: ignore[arg-type]
                        default_context=128_000,
                        env_key="OPENAI_API_KEY",
                    )
                )
            else:
                replaced.append(spec)
        monkeypatch.setattr(router_mod, "_PROVIDERS", replaced)

        body = client.get("/api/v1/models").json()
        gpt4o = next(m for m in body if m["model"] == "gpt-4o")
        gpt35 = next(m for m in body if m["model"] == "gpt-3.5-turbo")
        assert gpt4o["context_window"] == 128_000
        assert gpt35["context_window"] == 16_385
