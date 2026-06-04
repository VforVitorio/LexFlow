"""``/api/v1/secrets`` — cloud-provider API key management (#120).

Three endpoints, all of them never return the raw key bytes:

* ``GET    /secrets``          — which providers are configured?
* ``POST   /secrets``          — store a key for one provider.
* ``DELETE /secrets/{provider}`` — remove a stored key (idempotent).

Storage is the OS keyring (Windows Credential Manager / macOS Keychain
/ Linux Secret Service) via :mod:`lexflow.chat.secrets`. The provider
classes resolve via the same module so a freshly stored key is
immediately picked up by the next call to ``stream_chat``.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new provider                → extend
                                       :data:`lexflow.chat.secrets.SUPPORTED_PROVIDERS`.
* Add a "test connectivity" endpoint → see #120 follow-up
                                       (``POST /api/v1/models/test``);
                                       intentionally out of this PR.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from lexflow.chat.secrets import (
    SUPPORTED_PROVIDERS,
    UnknownProviderError,
    configured_providers,
    delete_api_key,
    set_api_key,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/secrets", tags=["Secrets"])


class SecretStatusItem(BaseModel):
    """One provider's "is a key configured?" row.

    ``provider`` is the canonical key name (``openai`` / ``anthropic``
    / ``google``). ``configured`` collapses both env vars and keyring
    presence into a single boolean — the UI shows the same green dot
    regardless of source.
    """

    provider: str
    configured: bool


class SecretStatusResponse(BaseModel):
    """Object wrapper around the status list (per Sprint 6 api-6)."""

    items: list[SecretStatusItem]


class SecretCreateRequest(BaseModel):
    """Inbound body for ``POST /secrets``.

    ``api_key`` is on the wire only for the lifetime of this request —
    never echoed back, never logged, persisted via keyring and dropped.
    """

    provider: str = Field(..., description="One of: openai, anthropic, google.")
    api_key: str = Field(..., min_length=1, description="The API key bytes to store.")


@router.get(
    "",
    response_model=SecretStatusResponse,
    summary="List which cloud providers have a key configured (#120).",
)
def list_secrets() -> SecretStatusResponse:
    """Report which providers are configured without exposing the keys."""
    snapshot = configured_providers()
    items = [SecretStatusItem(provider=p, configured=v) for p, v in snapshot.items()]
    return SecretStatusResponse(items=items)


@router.post(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Store an API key for a cloud provider in the OS keyring (#120).",
    responses={
        204: {"description": "Stored."},
        400: {"description": "Unknown provider or empty key."},
    },
)
def create_secret(body: SecretCreateRequest) -> None:
    """Save ``body.api_key`` for ``body.provider`` in the keyring."""
    try:
        set_api_key(body.provider, body.api_key)
    except UnknownProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "unknown_provider",
                "message": str(exc),
                "supported": sorted(SUPPORTED_PROVIDERS),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "empty_api_key", "message": str(exc)},
        ) from exc


@router.delete(
    "/{provider}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a stored API key (#120). Idempotent.",
    responses={
        204: {"description": "Removed (or no key was set)."},
        400: {"description": "Unknown provider."},
    },
)
def delete_secret(provider: str) -> None:
    """Remove ``provider``'s key from the keyring.

    Idempotent — deleting a key that wasn't there still returns 204
    (matches the Sprint 5 api-3 audit fix on chat threads). The env
    var is NOT cleared; it lives outside our control.
    """
    try:
        delete_api_key(provider)
    except UnknownProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "unknown_provider",
                "message": str(exc),
                "supported": sorted(SUPPORTED_PROVIDERS),
            },
        ) from exc
