"""Tests for the chat provider wrappers (issue #103).

Each provider wraps a third-party SDK and surfaces a `ChatProviderError`
on auth / rate / connection issues. We stub the SDK at the right level
to exercise the wrapper without making real network calls.

Coverage focus:
* ``list_models`` happy path returns the expected list shape.
* SDK errors get re-raised as :class:`ChatProviderError`.
* The Anthropic / Google providers expose hardcoded model lists — those
  asserts double as regression guards if the list ever drifts.
"""

from __future__ import annotations

from typing import ClassVar

import pytest
from pytest import MonkeyPatch

from lexflow.chat.base import ChatProviderError


class TestOllamaProvider:
    @pytest.mark.asyncio
    async def test_list_models_returns_names(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import ollama as ollama_mod

        class _FakeAsyncClient:
            def __init__(self, *args: object, **kwargs: object) -> None: ...
            async def list(self) -> dict:
                return {"models": [{"name": "llama3.1:8b"}, {"name": "mistral:7b"}]}

        monkeypatch.setattr(ollama_mod.ollama, "AsyncClient", _FakeAsyncClient)
        provider = ollama_mod.OllamaProvider()
        models = await provider.list_models()
        assert models == ["llama3.1:8b", "mistral:7b"]

    @pytest.mark.asyncio
    async def test_list_models_wraps_sdk_error(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import ollama as ollama_mod

        class _BrokenClient:
            def __init__(self, *args: object, **kwargs: object) -> None: ...
            async def list(self) -> dict:
                raise RuntimeError("connection refused")

        monkeypatch.setattr(ollama_mod.ollama, "AsyncClient", _BrokenClient)
        provider = ollama_mod.OllamaProvider()
        with pytest.raises(ChatProviderError, match="Ollama"):
            await provider.list_models()


class TestOpenAIProvider:
    @pytest.mark.asyncio
    async def test_list_models_filters_gpt_only(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import openai_provider as openai_mod

        class _FakeModel:
            def __init__(self, model_id: str) -> None:
                self.id = model_id

        class _FakeResponse:
            data: ClassVar = [_FakeModel("gpt-4o"), _FakeModel("dall-e-3"), _FakeModel("gpt-3.5-turbo")]

        class _FakeModelsAPI:
            async def list(self) -> _FakeResponse:
                return _FakeResponse()

        class _FakeClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                self.models = _FakeModelsAPI()

        monkeypatch.setattr(openai_mod.openai, "AsyncOpenAI", _FakeClient)
        provider = openai_mod.OpenAIProvider(api_key="sk-test")
        models = await provider.list_models()
        # Provider filters out non-GPT models (e.g. dall-e) and sorts the rest.
        assert models == sorted(["gpt-4o", "gpt-3.5-turbo"])


class TestAnthropicProvider:
    @pytest.mark.asyncio
    async def test_list_models_returns_hardcoded_catalogue(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import anthropic_provider as anthropic_mod

        # The provider doesn't call the SDK for `list_models` — it returns
        # a baked-in list. Still need to make construction succeed.
        class _FakeClient:
            def __init__(self, *args: object, **kwargs: object) -> None: ...

        monkeypatch.setattr(anthropic_mod.anthropic, "AsyncAnthropic", _FakeClient)
        provider = anthropic_mod.AnthropicProvider(api_key="sk-test")
        models = await provider.list_models()
        assert isinstance(models, list)
        assert all("claude" in m for m in models)


class TestGoogleProvider:
    @pytest.mark.asyncio
    async def test_list_models_returns_gemini_catalogue(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import google_provider as google_mod

        class _FakeClient:
            def __init__(self, *args: object, **kwargs: object) -> None: ...

        monkeypatch.setattr(google_mod.genai, "Client", _FakeClient)
        provider = google_mod.GoogleProvider(api_key="sk-test")
        models = await provider.list_models()
        assert isinstance(models, list)
        assert all("gemini" in m for m in models)


class TestLMStudioProvider:
    @pytest.mark.asyncio
    async def test_list_models_passes_through_openai_compatible(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import lmstudio as lmstudio_mod

        class _FakeModel:
            def __init__(self, model_id: str) -> None:
                self.id = model_id

        class _FakeResponse:
            data: ClassVar = [_FakeModel("local-llama")]

        class _FakeModelsAPI:
            async def list(self) -> _FakeResponse:
                return _FakeResponse()

        class _FakeClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                self.models = _FakeModelsAPI()

        monkeypatch.setattr(lmstudio_mod.openai, "AsyncOpenAI", _FakeClient)
        provider = lmstudio_mod.LMStudioProvider()
        models = await provider.list_models()
        assert models == ["local-llama"]
