"""Google Gemini chat provider for LexFlow."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from google import genai

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError
from lexflow.chat.secrets import get_api_key

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
        # Key resolution: explicit arg → env var → OS keyring. See
        # ``chat/secrets.py`` for the full contract.
        resolved_key = api_key or get_api_key("google")
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
            # Audit #409: Gemini SDK errors can include the API key in
            # the URL portion of the message. Static client-facing
            # message; original ``exc`` preserved as ``__cause__`` for
            # server-side logging.
            raise ChatProviderError("Google Gemini error") from exc
