"""Ollama chat provider for LexFlow."""

from __future__ import annotations

from collections.abc import AsyncGenerator

import ollama

from lexflow.chat.base import ChatMessage, ChatProvider, ChatProviderError


class OllamaProvider(ChatProvider):
    """Chat provider backed by a local Ollama instance."""

    def __init__(self, host: str = "http://localhost:11434") -> None:
        self._host = host

    async def list_models(self) -> list[str]:
        """Return model names available in the local Ollama instance."""
        try:
            client = ollama.AsyncClient(host=self._host)
            response = await client.list()
            models: list[dict[str, str]] = response.get("models", []) if isinstance(response, dict) else []
            return [m["name"] for m in models if "name" in m]
        except Exception as exc:
            raise ChatProviderError("ollama", str(exc)) from exc

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream a chat completion from Ollama."""
        try:
            client = ollama.AsyncClient(host=self._host)
            ollama_messages = [{"role": m.role, "content": m.content} for m in messages]
            async for chunk in await client.chat(model=model, messages=ollama_messages, stream=True):
                content = chunk.get("message", {}).get("content", "") if isinstance(chunk, dict) else ""
                if content:
                    yield content
        except Exception as exc:
            raise ChatProviderError("ollama", str(exc)) from exc
