"""Base interface for all LexFlow chat providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from pydantic import BaseModel


class ChatProviderError(Exception):
    """Raised when a chat provider encounters an error."""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str


class ChatProvider(ABC):
    @abstractmethod
    async def list_models(self) -> list[str]: ...

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncIterator[str]: ...
