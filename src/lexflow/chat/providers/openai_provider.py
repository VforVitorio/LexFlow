"""OpenAI chat provider for LexFlow."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import cast

import openai
from openai import AsyncStream
from openai.types.chat import ChatCompletionChunk

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError
from lexflow.chat.secrets import get_api_key


class OpenAIProvider(ChatProvider):
    """Chat provider backed by the OpenAI API.

    Key resolution order (see ``chat/secrets.py``):
      1. Explicit ``api_key`` argument (tests, scripted use).
      2. ``OPENAI_API_KEY`` env var (back-compat, headless deploys).
      3. OS keyring (the user-facing path on desktop installs).
    ``None`` is fine for ``list_models`` (will surface a clean
    ``ChatProviderError`` on call) — we don't validate eagerly at
    construction so the provider stays cheap to instantiate.
    """

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or get_api_key("openai")
        self._client = openai.AsyncOpenAI(api_key=resolved_key)

    async def list_models(self) -> list[str]:
        """Return all available GPT model IDs."""
        try:
            response = await self._client.models.list()
            return sorted(m.id for m in response.data if m.id.startswith("gpt"))
        except openai.AuthenticationError as exc:
            raise ChatProviderError(f"OpenAI authentication failed: {exc}") from exc
        except openai.RateLimitError as exc:
            raise ChatProviderError(f"OpenAI rate limit exceeded: {exc}") from exc

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completions from OpenAI, yielding text chunks."""
        openai_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
        try:
            stream = cast(
                AsyncStream[ChatCompletionChunk],
                await self._client.chat.completions.create(
                    model=model,
                    messages=openai_messages,  # type: ignore[arg-type]
                    stream=True,
                ),
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
        except openai.AuthenticationError as exc:
            raise ChatProviderError(f"OpenAI authentication failed: {exc}") from exc
        except openai.RateLimitError as exc:
            raise ChatProviderError(f"OpenAI rate limit exceeded: {exc}") from exc
