"""Anthropic chat provider for LexFlow."""

from __future__ import annotations

from collections.abc import AsyncGenerator

import anthropic

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError
from lexflow.chat.secrets import get_api_key

_ANTHROPIC_MODELS: list[str] = [
    # Stay aligned with the current Claude 4.X family (#104 #14). Opus
    # bumped from 4.6 → 4.8; Sonnet 4.6 and Haiku 4.5 remain current.
    # When the line moves again, bump these IDs alongside any code that
    # pins a default model elsewhere.
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
]


class AnthropicProvider(ChatProvider):
    """Chat provider backed by the Anthropic API."""

    def __init__(self, api_key: str | None = None) -> None:
        # Key resolution: explicit arg → env var → OS keyring. See
        # ``chat/secrets.py`` for the full contract.
        resolved_key = api_key or get_api_key("anthropic")
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
            # Audit #409: SDK exception body may carry a partial key or
            # workspace id. Use a static message; the original ``exc``
            # remains the ``__cause__`` for server-side logs.
            raise ChatProviderError("Anthropic rate limit exceeded") from exc
        except anthropic.AuthenticationError as exc:
            raise ChatProviderError("Anthropic authentication failed") from exc
