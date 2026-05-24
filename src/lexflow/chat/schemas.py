"""Pydantic schemas for the chat / model surface of the API.

These types are the contract between the FastAPI routers in
``src/lexflow/api/routers/`` and the React client (``frontend/src/lib/types``).
Keep field names in ``snake_case``; the frontend converts to ``camelCase``
through its typed wrapper.
"""

from __future__ import annotations

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
