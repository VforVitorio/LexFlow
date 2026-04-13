"""Anthropic chat provider for LexFlow."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

import anthropic

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError

_ANTHROPIC_MODELS: list[str] = [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
]


class AnthropicProvider(ChatProvider):
    """Chat provider backed by the Anthropic API."""

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self._client = anthropic.AsyncAnthropic(api_key=resolved_key)

    async def list_models(self) -> list[str]:
        """Return the list of supported Anthropic model IDs."""
        return list(_ANTHROPIC_MODELS)

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completions from Anthropic, yielding text chunks."""
        # Separate system message (Anthropic uses a top-level system param)
        system_parts: list[str] = []
        user_messages: list[dict[str, str]] = []

        for msg in messages:
            if msg.role == "system":
                system_parts.append(msg.content)
            else:
                user_messages.append({"role": msg.role, "content": msg.content})

        system_prompt = "\n\n".join(system_parts) if system_parts else anthropic.NOT_GIVEN

        try:
            async with self._client.messages.stream(
                model=model,
                max_tokens=4096,
                system=system_prompt,  # type: ignore[arg-type]
                messages=user_messages,  # type: ignore[arg-type]
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except anthropic.RateLimitError as exc:
            raise ChatProviderError(f"Anthropic rate limit exceeded: {exc}") from exc
        except anthropic.AuthenticationError as exc:
            raise ChatProviderError(f"Anthropic authentication failed: {exc}") from exc
