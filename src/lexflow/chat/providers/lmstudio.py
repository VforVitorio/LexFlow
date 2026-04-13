"""LM Studio local LLM provider."""

from __future__ import annotations

from collections.abc import AsyncIterator

import openai

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError


class LMStudioProvider(ChatProvider):
    """Chat provider backed by a local LM Studio instance (OpenAI-compatible API)."""

    def __init__(self, base_url: str = "http://localhost:1234/v1") -> None:
        self._client = openai.AsyncOpenAI(base_url=base_url, api_key="lm-studio")

    async def list_models(self) -> list[str]:
        """Return ids of all models loaded in LM Studio."""
        try:
            response = await self._client.models.list()
            return [m.id for m in response.data]
        except openai.APIConnectionError as exc:
            raise ChatProviderError(str(exc)) from exc

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncIterator[str]:
        """Stream chat completions from LM Studio, yielding text chunks."""
        openai_messages = [{"role": m.role, "content": m.content} for m in messages]
        try:
            stream = await self._client.chat.completions.create(
                model=model,
                messages=openai_messages,  # type: ignore[arg-type]
                stream=True,
            )
            async for chunk in stream:
                yield chunk.choices[0].delta.content or ""
        except openai.APIConnectionError as exc:
            raise ChatProviderError(str(exc)) from exc
