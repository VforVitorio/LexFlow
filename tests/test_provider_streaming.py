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

Anthropic + Google land here too. Anthropic streams via
``client.messages.stream(...)`` (async context manager whose
``text_stream`` is an async iterator); Google via
``await client.aio.models.generate_content_stream(...)`` (a coroutine
that returns an async iterator). Each gets a class-level fake that
matches the shape; tests assert the same three contracts as the
others: yield the expected chunks, wrap SDK errors, let real bugs
escape.
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
    async def test_yields_content_from_real_chatresponse_objects(self, monkeypatch: MonkeyPatch) -> None:
        """Regression: the real SDK yields ``ChatResponse`` (a
        ``SubscriptableBaseModel``), NOT ``dict``. An ``isinstance(chunk,
        dict)`` guard would silently drop every token in production while
        still passing the dict-fed tests above.
        """
        from ollama import ChatResponse, Message

        from lexflow.chat.providers import ollama as ollama_mod

        _OllamaStreamingClient.chunks = [
            ChatResponse(model="m", message=Message(role="assistant", content="Hola ")),
            ChatResponse(model="m", message=Message(role="assistant", content="mundo.")),
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


# ─── Anthropic ──────────────────────────────────────────────────────────


class _FakeAnthropicStream:
    """Stand-in for the object returned by ``client.messages.stream(...)``.

    Real Anthropic stream is an *async context manager* whose
    ``text_stream`` attribute is an *async iterator* of strings. We
    reproduce that shape (and let canned ``Exception`` values raise
    when iterated, same trick the OpenAI fake uses).
    """

    text_chunks: ClassVar[list[Any]] = []

    async def __aenter__(self) -> _FakeAnthropicStream:
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    @property
    def text_stream(self) -> AsyncIterator[str]:
        async def _gen() -> AsyncIterator[str]:
            for chunk in self.text_chunks:
                if isinstance(chunk, Exception):
                    raise chunk
                yield chunk

        return _gen()


class _FakeAnthropicMessagesAPI:
    """Stand-in for ``client.messages``. Only ``stream(...)`` is touched."""

    def __init__(self, *, raise_on_call: Exception | None = None) -> None:
        self._raise = raise_on_call

    def stream(self, **kwargs: object) -> _FakeAnthropicStream:
        if self._raise is not None:
            raise self._raise
        return _FakeAnthropicStream()


class _FakeAnthropicClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs
        self.messages = _FakeAnthropicMessagesAPI()


def _fake_anthropic_response() -> Any:
    """Anthropic's exception classes need an ``httpx.Response`` too."""
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = MagicMock(spec=httpx.Response)
    response.request = request
    response.status_code = 401
    response.headers = {}
    return response


class TestAnthropicStreamChat:
    @pytest.mark.asyncio
    async def test_yields_text_stream_chunks(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import anthropic_provider as anthropic_mod

        _FakeAnthropicStream.text_chunks = ["Hola ", "mundo."]
        monkeypatch.setattr(anthropic_mod.anthropic, "AsyncAnthropic", _FakeAnthropicClient)
        provider = anthropic_mod.AnthropicProvider(api_key="sk-test")
        chunks = [c async for c in provider.stream_chat([ChatMessage(role="user", content="?")], "claude-sonnet-4-6")]
        assert chunks == ["Hola ", "mundo."]

    @pytest.mark.asyncio
    async def test_separates_system_message_from_history(self, monkeypatch: MonkeyPatch) -> None:
        """System messages get extracted to the top-level ``system`` param.

        Regression guard: a bug here would forward system content as a
        ``user`` turn and silently change model behaviour.
        """
        from lexflow.chat.providers import anthropic_provider as anthropic_mod

        captured: dict[str, object] = {}

        class _CapturingMessagesAPI(_FakeAnthropicMessagesAPI):
            def stream(self, **kwargs: object) -> _FakeAnthropicStream:
                captured.update(kwargs)
                return _FakeAnthropicStream()

        class _CapturingClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                self.messages = _CapturingMessagesAPI()

        _FakeAnthropicStream.text_chunks = []
        monkeypatch.setattr(anthropic_mod.anthropic, "AsyncAnthropic", _CapturingClient)
        provider = anthropic_mod.AnthropicProvider(api_key="sk-test")
        async for _ in provider.stream_chat(
            [
                ChatMessage(role="system", content="be terse"),
                ChatMessage(role="user", content="hi"),
            ],
            "claude-sonnet-4-6",
        ):
            pass
        assert captured["system"] == "be terse"
        assert captured["messages"] == [{"role": "user", "content": "hi"}]

    @pytest.mark.asyncio
    async def test_wraps_auth_error_as_chat_provider_error(self, monkeypatch: MonkeyPatch) -> None:
        import anthropic as anthropic_pkg

        from lexflow.chat.providers import anthropic_provider as anthropic_mod

        class _AuthErroringClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                self.messages = _FakeAnthropicMessagesAPI(
                    raise_on_call=anthropic_pkg.AuthenticationError(
                        message="bad key",
                        response=_fake_anthropic_response(),
                        body=None,
                    )
                )

        monkeypatch.setattr(anthropic_mod.anthropic, "AsyncAnthropic", _AuthErroringClient)
        provider = anthropic_mod.AnthropicProvider(api_key="sk-test")
        with pytest.raises(ChatProviderError, match="authentication"):
            async for _ in provider.stream_chat([ChatMessage(role="user", content="?")], "claude-sonnet-4-6"):
                pass

    @pytest.mark.asyncio
    async def test_wraps_rate_limit_as_chat_provider_error(self, monkeypatch: MonkeyPatch) -> None:
        import anthropic as anthropic_pkg

        from lexflow.chat.providers import anthropic_provider as anthropic_mod

        _FakeAnthropicStream.text_chunks = [
            anthropic_pkg.RateLimitError(
                message="slow down",
                response=_fake_anthropic_response(),
                body=None,
            )
        ]
        monkeypatch.setattr(anthropic_mod.anthropic, "AsyncAnthropic", _FakeAnthropicClient)
        provider = anthropic_mod.AnthropicProvider(api_key="sk-test")
        with pytest.raises(ChatProviderError, match="rate limit"):
            async for _ in provider.stream_chat([ChatMessage(role="user", content="?")], "claude-sonnet-4-6"):
                pass


# ─── Google Gemini ──────────────────────────────────────────────────────


class _FakeGoogleChunk:
    def __init__(self, text: str | None) -> None:
        self.text = text


class _FakeGoogleStream:
    """Async iterator for chunks from Gemini's stream API."""

    chunks: ClassVar[list[Any]] = []

    def __aiter__(self) -> _FakeGoogleStream:
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


class _FakeGoogleModelsAPI:
    def __init__(self, *, raise_on_call: Exception | None = None) -> None:
        self._raise = raise_on_call

    async def generate_content_stream(self, **kwargs: object) -> _FakeGoogleStream:
        if self._raise is not None:
            raise self._raise
        return _FakeGoogleStream()


class _FakeGoogleAio:
    def __init__(self, **kwargs: object) -> None:
        self.models = _FakeGoogleModelsAPI(**kwargs)


class _FakeGoogleClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        del args, kwargs
        self.aio = _FakeGoogleAio()


class TestGoogleStreamChat:
    @pytest.mark.asyncio
    async def test_yields_text_chunks_and_skips_empty(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import google_provider as google_mod

        _FakeGoogleStream.chunks = [
            _FakeGoogleChunk("Hola "),
            _FakeGoogleChunk(None),  # provider must skip None text
            _FakeGoogleChunk("mundo."),
            _FakeGoogleChunk(""),  # empty too
        ]
        monkeypatch.setattr(google_mod.genai, "Client", _FakeGoogleClient)
        provider = google_mod.GoogleProvider(api_key="sk-test")
        chunks = [c async for c in provider.stream_chat([ChatMessage(role="user", content="?")], "gemini-2.0-flash")]
        assert chunks == ["Hola ", "mundo."]

    @pytest.mark.asyncio
    async def test_maps_assistant_role_to_model(self, monkeypatch: MonkeyPatch) -> None:
        """The ``assistant`` → ``model`` mapping is a documented adapter
        rule; regression guard so a refactor doesn't silently drop it.
        """
        from lexflow.chat.providers import google_provider as google_mod

        captured: dict[str, object] = {}

        class _CapturingModelsAPI(_FakeGoogleModelsAPI):
            async def generate_content_stream(self, **kwargs: object) -> _FakeGoogleStream:
                captured.update(kwargs)
                return _FakeGoogleStream()

        class _CapturingAio:
            def __init__(self) -> None:
                self.models = _CapturingModelsAPI()

        class _CapturingClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                self.aio = _CapturingAio()

        _FakeGoogleStream.chunks = []
        monkeypatch.setattr(google_mod.genai, "Client", _CapturingClient)
        provider = google_mod.GoogleProvider(api_key="sk-test")
        async for _ in provider.stream_chat(
            [
                ChatMessage(role="user", content="hi"),
                ChatMessage(role="assistant", content="hello"),
            ],
            "gemini-2.0-flash",
        ):
            pass
        roles = [c["role"] for c in captured["contents"]]  # type: ignore[union-attr,index]
        assert roles == ["user", "model"]

    @pytest.mark.asyncio
    async def test_wraps_sdk_error_as_chat_provider_error(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat.providers import google_provider as google_mod

        class _ErroringAio:
            def __init__(self) -> None:
                self.models = _FakeGoogleModelsAPI(raise_on_call=RuntimeError("quota exhausted"))

        class _ErroringClient:
            def __init__(self, *args: object, **kwargs: object) -> None:
                self.aio = _ErroringAio()

        monkeypatch.setattr(google_mod.genai, "Client", _ErroringClient)
        provider = google_mod.GoogleProvider(api_key="sk-test")
        with pytest.raises(ChatProviderError, match="Google Gemini"):
            async for _ in provider.stream_chat([ChatMessage(role="user", content="?")], "gemini-2.0-flash"):
                pass
