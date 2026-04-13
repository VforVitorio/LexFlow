"""Reflex state for the LexFlow chat UI."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import reflex as rx

from lexflow.chat.base import ChatMessage, ChatProvider


def _get_provider(name: str) -> ChatProvider:
    """Instantiate the requested provider by name."""
    if name == "ollama":
        from lexflow.chat.providers.ollama import OllamaProvider

        return OllamaProvider()
    if name == "lmstudio":
        from lexflow.chat.providers.lmstudio import LMStudioProvider

        return LMStudioProvider()
    if name == "openai":
        from lexflow.chat.providers.openai_provider import OpenAIProvider

        return OpenAIProvider()
    if name == "anthropic":
        from lexflow.chat.providers.anthropic_provider import AnthropicProvider

        return AnthropicProvider()
    if name == "google":
        from lexflow.chat.providers.google_provider import GoogleProvider

        return GoogleProvider()
    msg = f"Unknown provider: {name}"
    raise ValueError(msg)


class ChatState(rx.State):
    """Application state for the LexFlow chat interface."""

    messages: list[dict[str, Any]] = []  # noqa: RUF012
    provider_name: str = "ollama"
    model: str = ""
    available_models: list[str] = []  # noqa: RUF012
    is_streaming: bool = False
    input_value: str = ""

    PROVIDERS: list[str] = ["ollama", "lmstudio", "openai", "anthropic", "google"]  # noqa: RUF012

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    def set_provider(self, provider: str) -> None:
        """Switch the active provider and clear the model selection."""
        self.provider_name = provider
        self.model = ""
        self.available_models = []

    def set_model(self, model: str) -> None:
        """Select a model from the available list."""
        self.model = model

    def set_input(self, value: str) -> None:
        """Update the chat input field value."""
        self.input_value = value

    async def load_models(self) -> None:
        """Fetch available models from the selected provider."""
        try:
            provider = _get_provider(self.provider_name)
            self.available_models = await provider.list_models()
            if self.available_models and not self.model:
                self.model = self.available_models[0]
        except Exception:
            self.available_models = []

    async def send_message(self) -> AsyncIterator[None]:  # type: ignore[override]
        """Send the current input as a user message and stream the response."""
        user_text = self.input_value.strip()
        if not user_text or self.is_streaming:
            return

        # Add user message and clear input
        self.messages = [*self.messages, {"role": "user", "content": user_text}]
        self.input_value = ""
        self.is_streaming = True
        yield

        # Add empty assistant placeholder
        self.messages = [*self.messages, {"role": "assistant", "content": ""}]
        yield

        try:
            provider = _get_provider(self.provider_name)
            chat_messages = [ChatMessage(role=m["role"], content=m["content"]) for m in self.messages[:-1]]
            model = self.model or (self.available_models[0] if self.available_models else "")

            stream = provider.stream_chat(chat_messages, model)
            async for chunk in stream:
                updated = list(self.messages)
                last = updated[-1]
                updated[-1] = {"role": last["role"], "content": last["content"] + chunk}
                self.messages = updated
                yield
        except Exception as exc:
            updated = list(self.messages)
            updated[-1] = {"role": "assistant", "content": f"[Error: {exc}]"}
            self.messages = updated
        finally:
            self.is_streaming = False
            yield
