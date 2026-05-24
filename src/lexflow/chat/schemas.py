"""Pydantic schemas for the chat / model surface of the API.

These types are the contract between the FastAPI routers in
``src/lexflow/api/routers/`` and the React client (``frontend/src/lib/types``).
Keep field names in ``snake_case``; the frontend converts to ``camelCase``
through its typed wrapper.

Two distinct "model" concepts live in this module — keep them separate:

* :class:`ModelInfo`          — describes a chat *provider+model* pair the
                                user can pick (``GET /api/v1/models``).
* :class:`ChatThread*` / :class:`ChatMessage*` — describe stored chat
  threads and turns (``GET /api/v1/chat/threads`` and friends, issue #83).

Storage-layer counterparts live in :mod:`lexflow.chat.storage_models`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ModelInfo(BaseModel):
    """Single (provider, model) pair surfaced by ``GET /api/v1/models``.

    Invariants:
    * ``id`` is the unique key the frontend uses to identify a model. Always
      ``"{provider}:{model}"`` for configured entries, or ``"{provider}:"``
      for unconfigured-provider placeholders.
    * ``configured = False`` means the user has not set up this provider
      (e.g. no API key for a cloud one, or the local server isn't running).
      In that case ``model`` is the empty string and the entry is a
      placeholder so the UI can show "OpenAI — needs API key".
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description='Stable identifier, e.g. "ollama:llama3.1:8b".')
    provider: str = Field(..., description="Provider key: ollama | lmstudio | openai | anthropic | google.")
    model: str = Field("", description="Model name within the provider. Empty when the provider is not configured.")
    local: bool = Field(..., description="True for Ollama / LM Studio; False for cloud providers.")
    configured: bool = Field(..., description="True when the provider is reachable and a model is available.")
    context_window: int | None = Field(None, description="Best-effort context window in tokens. None when unknown.")
    error: str | None = Field(None, description="Short error message when configured=False.")


# ---------------------------------------------------------------------------
# Chat thread persistence (issue #83)
# ---------------------------------------------------------------------------

ChatRole = Literal["user", "assistant", "tool", "system"]


class ChatMessageRead(BaseModel):
    """One persisted message as returned to the client.

    ``payload`` is the decoded ``payload_json`` from storage — assistant
    sources live under ``payload.sources``, tool calls under
    ``payload.name`` / ``payload.args`` / ``payload.result``.
    """

    id: str
    thread_id: str
    role: ChatRole
    content: str
    created_at: datetime
    payload: dict[str, Any] | None = None


class ChatThreadRead(BaseModel):
    """Thread metadata returned in listings (no messages)."""

    id: str
    title: str
    model: str
    created_at: datetime
    updated_at: datetime
    # Snippet of the latest message, useful for the conversation rail.
    preview: str | None = None


class ChatThreadDetail(ChatThreadRead):
    """Thread + full message history (``GET /chat/threads/{id}``)."""

    messages: list[ChatMessageRead] = Field(default_factory=list)


class ChatThreadList(BaseModel):
    """Paginated listing envelope for ``GET /chat/threads``."""

    items: list[ChatThreadRead]
    total: int
    page: int
    page_size: int


class ChatThreadCreate(BaseModel):
    """Body of ``POST /chat/threads``. All fields optional."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(None, max_length=200)
    model: str | None = Field(None, max_length=120)


class ChatThreadPatch(BaseModel):
    """Body of ``PATCH /chat/threads/{id}``. Currently only ``title``."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(None, max_length=200)


class ChatMessageCreate(BaseModel):
    """Body of ``POST /chat/threads/{id}/messages``.

    Tracked here for completeness even though the actual streaming-send
    endpoint lands in #84 — the persistence layer needs a way to record
    user turns *now* so the rest of the surface (thread list with
    preview, etc.) becomes testable without waiting on the SSE work.
    """

    model_config = ConfigDict(extra="forbid")

    role: ChatRole = Field("user")
    content: str = Field(..., min_length=1, max_length=10_000)
    payload: dict[str, Any] | None = None
