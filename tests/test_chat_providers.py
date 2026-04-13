"""Tests for LexFlow chat providers and the ChatProvider interface."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError

# ---------------------------------------------------------------------------
# Helper fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def user_message() -> ChatMessage:
    return ChatMessage(role="user", content="¿Qué dice el artículo 1 de la Constitución?")


# ---------------------------------------------------------------------------
# Ollama provider
# ---------------------------------------------------------------------------


async def test_ollama_list_models_success() -> None:
    """OllamaProvider.list_models should return model names from the client response."""
    with patch("ollama.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.list = AsyncMock(
            return_value={"models": [{"name": "llama3"}, {"name": "mistral"}]}
        )
        mock_client_cls.return_value = mock_client

        from lexflow.chat.providers.ollama import OllamaProvider

        provider = OllamaProvider()
        models = await provider.list_models()

    assert "llama3" in models
    assert "mistral" in models


async def test_ollama_list_models_error() -> None:
    """OllamaProvider.list_models should raise ChatProviderError on connection failure."""
    with patch("ollama.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.list = AsyncMock(side_effect=ConnectionRefusedError("connection refused"))
        mock_client_cls.return_value = mock_client

        from lexflow.chat.providers.ollama import OllamaProvider

        provider = OllamaProvider()
        with pytest.raises(ChatProviderError):
            await provider.list_models()


# ---------------------------------------------------------------------------
# OpenAI provider
# ---------------------------------------------------------------------------


async def test_openai_list_models_success() -> None:
    """OpenAIProvider.list_models should return GPT model IDs."""
    mock_model_1 = MagicMock()
    mock_model_1.id = "gpt-4o"
    mock_model_2 = MagicMock()
    mock_model_2.id = "gpt-3.5-turbo"
    mock_model_3 = MagicMock()
    mock_model_3.id = "whisper-1"  # Should be excluded (no "gpt" prefix)

    mock_response = MagicMock()
    mock_response.data = [mock_model_1, mock_model_2, mock_model_3]

    with patch("openai.AsyncOpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_client.models = MagicMock()
        mock_client.models.list = AsyncMock(return_value=mock_response)
        mock_openai_cls.return_value = mock_client

        from lexflow.chat.providers.openai_provider import OpenAIProvider

        provider = OpenAIProvider(api_key="sk-test")
        models = await provider.list_models()

    assert "gpt-4o" in models
    assert "gpt-3.5-turbo" in models
    assert "whisper-1" not in models


async def test_openai_provider_auth_error() -> None:
    """OpenAIProvider should raise ChatProviderError when authentication fails."""
    import openai

    with patch("openai.AsyncOpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.json.return_value = {"error": {"message": "Invalid API key"}}
        mock_client.models = MagicMock()
        mock_client.models.list = AsyncMock(
            side_effect=openai.AuthenticationError(
                "Invalid API key",
                response=mock_response,
                body={"error": {"message": "Invalid API key"}},
            )
        )
        mock_openai_cls.return_value = mock_client

        from lexflow.chat.providers.openai_provider import OpenAIProvider

        provider = OpenAIProvider(api_key="invalid-key")
        with pytest.raises(ChatProviderError):
            await provider.list_models()


# ---------------------------------------------------------------------------
# Anthropic provider
# ---------------------------------------------------------------------------


async def test_anthropic_list_models_returns_known_models() -> None:
    """AnthropicProvider.list_models should return a non-empty curated list."""
    from lexflow.chat.providers.anthropic_provider import AnthropicProvider

    provider = AnthropicProvider(api_key="test-key")
    models = await provider.list_models()

    assert isinstance(models, list)
    assert len(models) > 0
    # All returned models should be strings
    assert all(isinstance(m, str) for m in models)


# ---------------------------------------------------------------------------
# Interface compliance
# ---------------------------------------------------------------------------


async def test_provider_interface_compliance() -> None:
    """All providers must be subclasses of ChatProvider."""
    from lexflow.chat.providers.anthropic_provider import AnthropicProvider
    from lexflow.chat.providers.google_provider import GoogleProvider
    from lexflow.chat.providers.lmstudio import LMStudioProvider
    from lexflow.chat.providers.ollama import OllamaProvider
    from lexflow.chat.providers.openai_provider import OpenAIProvider

    for provider_cls in (OllamaProvider, LMStudioProvider, OpenAIProvider, AnthropicProvider, GoogleProvider):
        assert issubclass(provider_cls, ChatProvider), f"{provider_cls.__name__} must subclass ChatProvider"


async def test_chat_message_model() -> None:
    """ChatMessage should be a valid Pydantic model with role and content."""
    msg = ChatMessage(role="user", content="Hello")
    assert msg.role == "user"
    assert msg.content == "Hello"

    assistant_msg = ChatMessage(role="assistant", content="Hola")
    assert assistant_msg.role == "assistant"

    system_msg = ChatMessage(role="system", content="Eres un asistente legal.")
    assert system_msg.role == "system"


async def test_chat_provider_error_is_exception() -> None:
    """ChatProviderError must be a subclass of Exception and carry a message."""
    err = ChatProviderError("something went wrong")
    assert isinstance(err, Exception)
    assert "something went wrong" in str(err)


# ---------------------------------------------------------------------------
# LM Studio provider
# ---------------------------------------------------------------------------


async def test_lmstudio_list_models_success() -> None:
    """LMStudioProvider.list_models should return model ids from the OpenAI client."""
    mock_model_a = MagicMock()
    mock_model_a.id = "lmstudio-community/llama3"
    mock_model_b = MagicMock()
    mock_model_b.id = "mistral-7b-instruct"

    mock_page = MagicMock()
    mock_page.data = [mock_model_a, mock_model_b]

    with patch("openai.AsyncOpenAI") as mock_openai_cls:
        mock_client = AsyncMock()
        mock_client.models.list = AsyncMock(return_value=mock_page)
        mock_openai_cls.return_value = mock_client

        from lexflow.chat.providers.lmstudio import LMStudioProvider

        provider = LMStudioProvider()
        models = await provider.list_models()

    assert "lmstudio-community/llama3" in models
    assert "mistral-7b-instruct" in models


async def test_lmstudio_list_models_connection_error() -> None:
    """LMStudioProvider.list_models should raise ChatProviderError on failure."""
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_async_ctx = AsyncMock()
        mock_async_ctx.__aenter__ = AsyncMock(return_value=mock_async_ctx)
        mock_async_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_async_ctx.get = AsyncMock(side_effect=ConnectionRefusedError("refused"))
        mock_client_cls.return_value = mock_async_ctx

        from lexflow.chat.providers.lmstudio import LMStudioProvider

        provider = LMStudioProvider()
        with pytest.raises(ChatProviderError):
            await provider.list_models()
