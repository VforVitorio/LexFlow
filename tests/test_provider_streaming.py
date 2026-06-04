"""Tests for ``stream_chat`` per provider (closes #28 streaming gap).

OpenAI's exception classes (``AuthenticationError``, ``RateLimitError``)
need a real ``httpx.Response`` to construct, so we build minimal stand-ins
with ``unittest.mock`` rather than wrestling with their __init__ shape.


The existing ``test_chat_providers.py`` exercises ``list_models`` against
each provider's SDK fake; this file extends coverage to the streaming
surface. For each provider we:

- mock the SDK's streaming primitive at the right level,
- assert ``stream_chat`` yields the expected text chunks,
- assert SDK errors are wrapped as :class:`ChatProviderError`.

We deliberately don't add stream tests for Anthropic / Google here —
their SDK streaming surfaces use context managers + async iterators
that need a heavier fake. They get their own follow-up issue.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, ClassVar
from unittest.mock import MagicMock

import httpx
import pytest
from pytest import MonkeyPatch

from lexflow.chat.base import ChatMessage, ChatProviderError


def _fake_openai_response() -> Any:
    """Return a minimal ``httpx.Response`` good enough to satisfy
    OpenAI's exception constructors.

    Both ``AuthenticationError`` and ``RateLimitError`` read
    ``response.request`` during ``__init__``; everything else they
    expose is ours to set.
    """
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    response = MagicMock(spec=httpx.Response)
    response.request = request
    response.status_code = 401
    response.headers = {}
    return response


# ─── Ollama ─────────────────────────────────────────────────────────────


class _OllamaStreamingClient:
    """Fake ``ollama.AsyncClient`` that yields canned chunks."""

    chunks: ClassVar[list[Any]] = []

    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs

    async def chat(self, **kwargs: Any) -> AsyncIterator[dict[str, Any]]:
        async def _gen() -> AsyncIterator[dict[str, Any]]:
            for chunk in self.chunks:
                if isinstance(chunk, Exception):
                    raise chunk
                yield chunk

        return _gen()


class TestOllamaStreamChat:
    @pytest.mark.asyncio
    async def test_yields_message_content_chunks(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import ollama as ollama_mod

        _OllamaStreamingClient.chunks = [
            {"message": {"content": "Hola "}},
            {"message": {"content": "mundo."}},
            {"message": {"content": ""}},  # empties are skipped
            {"done": True},  # missing "message" key is ignored
        ]
        monkeypatch.setattr(ollama_mod.ollama, "AsyncClient", _OllamaStreamingClient)
        provider = ollama_mod.OllamaProvider()
        chunks = [c async for c in provider.stream_chat([ChatMessage(role="user", content="?")], "fake-model")]
        assert chunks == ["Hola ", "mundo."]

    @pytest.mark.asyncio
    async def test_wraps_sdk_error_as_chat_provider_error(self, monkeypatch: MonkeyPatch) -> None:
        import httpx

        from lexflow.chat.providers import ollama as ollama_mod

        _OllamaStreamingClient.chunks = [httpx.ConnectError("connection refused")]
        monkeypatch.setattr(ollama_mod.ollama, "AsyncClient", _OllamaStreamingClient)
        provider = ollama_mod.OllamaProvider()
        with pytest.raises(ChatProviderError, match="Ollama"):
            async for _ in provider.stream_chat([ChatMessage(role="user", content="?")], "fake"):
                pass

    @pytest.mark.asyncio
    async def test_programmer_bug_escapes_unwrapped(self, monkeypatch: MonkeyPatch) -> None:
        """A TypeError mid-stream surfaces as itself (regression guard)."""
        from lexflow.chat.providers import ollama as ollama_mod

        _OllamaStreamingClient.chunks = [TypeError("wrong shape")]
        monkeypatch.setattr(ollama_mod.ollama, "AsyncClient", _OllamaStreamingClient)
        provider = ollama_mod.OllamaProvider()
        with pytest.raises(TypeError, match="wrong shape"):
            async for _ in provider.stream_chat([ChatMessage(role="user", content="?")], "fake"):
                pass


# ─── OpenAI (and LM Studio, which is OpenAI-compatible) ─────────────────


class _FakeChoiceDelta:
    def __init__(self, content: str | None) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str | None) -> None:
        self.delta = _FakeChoiceDelta(content)


class _FakeChunk:
    def __init__(self, content: str | None) -> None:
        self.choices = [_FakeChoice(content)]


class _FakeOpenAIStream:
    """Async iterator standing in for OpenAI's ``AsyncStream``."""

    chunks: ClassVar[list[Any]] = []

    def __aiter__(self) -> _FakeOpenAIStream:
        self._idx = 0
        return self

    async def __anext__(self) -> Any:
        if self._idx >= len(self.chunks):
            raise StopAsyncIteration
        chunk = self.chunks[self._idx]
        self._idx += 1
        if isinstance(chunk, Exception):
            raise chunk
        return chunk


class _FakeCompletionsAPI:
    async def create(self, **kwargs: object) -> _FakeOpenAIStream:
        return _FakeOpenAIStream()


class _FakeChatAPI:
    def __init__(self) -> None:
        self.completions = _FakeCompletionsAPI()


class _FakeOpenAIClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs
        self.chat = _FakeChatAPI()


class TestOpenAIStreamChat:
    @pytest.mark.asyncio
    async def test_yields_delta_content(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import openai_provider as openai_mod

        _FakeOpenAIStream.chunks = [
            _FakeChunk("Hello "),
            _FakeChunk(None),  # None deltas are skipped
            _FakeChunk("world."),
        ]
        monkeypatch.setattr(openai_mod.openai, "AsyncOpenAI", _FakeOpenAIClient)
        provider = openai_mod.OpenAIProvider(api_key="sk-test")
        chunks = [c async for c in provider.stream_chat([ChatMessage(role="user", content="hi")], "gpt-4o")]
        assert chunks == ["Hello ", "world."]

    @pytest.mark.asyncio
    async def test_wraps_auth_error_as_chat_provider_error(self, monkeypatch: MonkeyPatch) -> None:
        import openai

        from lexflow.chat.providers import openai_provider as openai_mod

        class _BrokenCompletionsAPI:
            async def create(self, **kwargs: object) -> _FakeOpenAIStream:
                raise openai.AuthenticationError(
                    message="bad key",
                    response=_fake_openai_response(),
                    body=None,
                )

        class _BrokenChatAPI:
            def __init__(self) -> None:
                self.completions = _BrokenCompletionsAPI()

        class _BrokenClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                self.chat = _BrokenChatAPI()

        monkeypatch.setattr(openai_mod.openai, "AsyncOpenAI", _BrokenClient)
        provider = openai_mod.OpenAIProvider(api_key="sk-test")
        with pytest.raises(ChatProviderError, match="authentication"):
            async for _ in provider.stream_chat([ChatMessage(role="user", content="?")], "gpt-4o"):
                pass

    @pytest.mark.asyncio
    async def test_wraps_rate_limit_as_chat_provider_error(self, monkeypatch: MonkeyPatch) -> None:
        import openai

        from lexflow.chat.providers import openai_provider as openai_mod

        _FakeOpenAIStream.chunks = [
            openai.RateLimitError(
                message="slow down",
                response=_fake_openai_response(),
                body=None,
            )
        ]
        monkeypatch.setattr(openai_mod.openai, "AsyncOpenAI", _FakeOpenAIClient)
        provider = openai_mod.OpenAIProvider(api_key="sk-test")
        with pytest.raises(ChatProviderError, match="rate limit"):
            async for _ in provider.stream_chat([ChatMessage(role="user", content="?")], "gpt-4o"):
                pass


# ─── LM Studio (OpenAI-compatible client; same shape) ───────────────────


class TestLMStudioStreamChat:
    @pytest.mark.asyncio
    async def test_yields_delta_content(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import lmstudio as lmstudio_mod

        _FakeOpenAIStream.chunks = [_FakeChunk("a"), _FakeChunk("b")]
        monkeypatch.setattr(lmstudio_mod.openai, "AsyncOpenAI", _FakeOpenAIClient)
        provider = lmstudio_mod.LMStudioProvider()
        chunks = [c async for c in provider.stream_chat([ChatMessage(role="user", content="x")], "local-llama")]
        assert chunks == ["a", "b"]
