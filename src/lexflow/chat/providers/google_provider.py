"""Google Gemini chat provider for LexFlow."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from google import genai

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError

_GOOGLE_MODELS: list[str] = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
]

_ROLE_MAP: dict[str, str] = {
    "user": "user",
    "assistant": "model",
    "system": "user",  # Google does not have a dedicated system role; prepend as user turn
}


class GoogleProvider(ChatProvider):
    """Chat provider backed by the Google Gemini API."""

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or os.environ.get("GOOGLE_API_KEY")
        self._client = genai.Client(api_key=resolved_key)

    async def list_models(self) -> list[str]:
        """Return the list of supported Google Gemini model IDs."""
        return list(_GOOGLE_MODELS)

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completions from Google Gemini, yielding text chunks."""
        # Convert ChatMessage list to Google Content format
        contents: list[genai.types.ContentDict] = []
        for msg in messages:
            google_role = _ROLE_MAP.get(msg.role, "user")
            contents.append({"role": google_role, "parts": [{"text": msg.content}]})

        try:
            async for chunk in await self._client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
            ):
                if chunk.text:
                    yield chunk.text
        except Exception as exc:
            raise ChatProviderError(f"Google Gemini error: {exc}") from exc
