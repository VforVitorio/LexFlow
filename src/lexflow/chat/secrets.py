"""OS-keyring wrapper for cloud-provider API keys (#120).

API keys for OpenAI / Anthropic / Google never go to ``localStorage``,
to a plain JSON file, or to logs. They live in the OS keyring via the
``keyring`` library:

* Windows  — Credential Manager
* macOS    — Keychain
* Linux    — Secret Service (gnome-keyring / kwallet)

The bridge between the chat providers and this module is the env-var
fallback path: providers still accept ``OPENAI_API_KEY`` etc. when
present, so headless deployments and CI keep working. When the env
var is absent, providers look here.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new cloud provider          → extend :data:`SUPPORTED_PROVIDERS`
                                       and its row in
                                       :data:`_PROVIDER_ENV`.
* Switch keyring backend            → set ``keyring.set_keyring(...)``
                                       once at app start; the rest of
                                       the module is backend-agnostic.
* Replace keyring with vault/sops   → swap implementations behind the
                                       four public functions; the
                                       provider call sites only see
                                       ``get_api_key()``.
"""

from __future__ import annotations

import logging
import os
from typing import Final

import keyring
from keyring.errors import KeyringError

logger = logging.getLogger(__name__)

# Service name registered under the OS keyring. Picked once and kept
# stable — changing this orphans every key the user already saved.
_SERVICE_NAME: Final[str] = "lexflow"

# The three providers whose keys live in the OS keyring. Local providers
# (Ollama / LM Studio) don't need keys.
SUPPORTED_PROVIDERS: Final[frozenset[str]] = frozenset({"openai", "anthropic", "google"})

# Each provider's legacy env-var fallback. Providers honour the env var
# first (back-compat with headless deploys), then ask the keyring.
_PROVIDER_ENV: Final[dict[str, str]] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
}


class UnknownProviderError(ValueError):
    """Raised when ``provider`` isn't one of ``SUPPORTED_PROVIDERS``."""


def _require_known(provider: str) -> None:
    if provider not in SUPPORTED_PROVIDERS:
        raise UnknownProviderError(f"Unknown provider: {provider!r}. Expected one of {sorted(SUPPORTED_PROVIDERS)}.")


def set_api_key(provider: str, api_key: str) -> None:
    """Store ``api_key`` for ``provider`` in the OS keyring.

    An empty string is rejected — call :func:`delete_api_key` to remove.
    """
    _require_known(provider)
    if not api_key:
        raise ValueError("api_key must not be empty; use delete_api_key() to remove a stored key")
    keyring.set_password(_SERVICE_NAME, provider, api_key)


def get_api_key(provider: str) -> str | None:
    """Return the stored key for ``provider``, or ``None``.

    Env var wins — ``OPENAI_API_KEY`` etc. let CI and Docker keep
    working without touching a keyring. Falls back to the keyring on
    the user's desktop install.

    Returns ``None`` (never raises) when neither source has the key;
    that's the documented "not configured" state.
    """
    _require_known(provider)
    env_value = os.environ.get(_PROVIDER_ENV[provider])
    if env_value:
        return env_value
    try:
        return keyring.get_password(_SERVICE_NAME, provider)
    except KeyringError:
        # Headless CI without a real backend often surfaces a
        # ``NoKeyringError``. Treat it as "key not configured" — the
        # provider layer will then raise a clean ChatProviderError.
        logger.debug("Keyring backend unavailable for %s; treating as no key.", repr(provider))
        return None


def delete_api_key(provider: str) -> bool:
    """Remove the stored key for ``provider``. Returns whether one existed.

    Idempotent: deleting a key that wasn't there returns ``False`` and
    doesn't raise. Env vars are NOT touched (those live outside our
    surface).
    """
    _require_known(provider)
    try:
        existing = keyring.get_password(_SERVICE_NAME, provider)
    except KeyringError:
        return False
    if existing is None:
        return False
    try:
        keyring.delete_password(_SERVICE_NAME, provider)
    except KeyringError:
        logger.warning("Failed to delete keyring entry for %s", repr(provider))
        return False
    return True


def configured_providers() -> dict[str, bool]:
    """Map every supported provider to whether a key is currently set.

    Source-agnostic: ``True`` if either the env var or the keyring has
    a value. Useful for the Settings UI's "what's configured?" panel
    without ever exposing the key bytes themselves.
    """
    return {provider: get_api_key(provider) is not None for provider in sorted(SUPPORTED_PROVIDERS)}
