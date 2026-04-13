"""OpenAI chat provider for LexFlow."""
from __future__ import annotations

import os
from collections.abc import AsyncIterator

import openai

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError


class OpenAIProvider(ChatProvider):
    """Chat provider backed by the OpenAI API."""

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or os.environ.get("OPENAI_API_KEY")
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
    ) -> AsyncIterator[str]:
        """Stream chat completions from OpenAI, yielding text chunks."""
        openai_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
        try:
            stream = await self._client.chat.completions.create(
                model=model,
                messages=openai_messages,  # type: ignore[arg-type]
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
        except openai.AuthenticationError as exc:
            raise ChatProviderError(f"OpenAI authentication failed: {exc}") from exc
        except openai.RateLimitError as exc:
            raise ChatProviderError(f"OpenAI rate limit exceeded: {exc}") from exc
