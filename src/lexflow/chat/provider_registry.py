"""Single source of truth for the chat-provider catalogue.

Both ``lexflow.api.routers.models`` and ``lexflow.chat.streaming`` need to
know the same things: the set of supported provider keys, how to build
a :class:`ChatProvider` from each key, whether the provider is local
(no credentials needed) or cloud (env var required), and the env var
name. Before this module each side maintained its own list; adding a
sixth provider meant editing two places and the lists could silently
drift. Now both sides import :data:`PROVIDER_SPECS`.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new provider                → append a :class:`ProviderSpec` to
                                       :data:`PROVIDER_SPECS` below.
* Change default context window     → ``default_context`` on the spec.
* Change credential env var         → ``env_key`` on the spec.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass

from lexflow.chat.base import ChatProvider
from lexflow.chat.providers import (
    AnthropicProvider,
    GoogleProvider,
    LMStudioProvider,
    OllamaProvider,
    OpenAIProvider,
)


@dataclass(frozen=True)
class ProviderSpec:
    """How to identify, probe, and label a chat provider.

    Invariants:
    * ``key`` matches the prefix used in ``"provider:model"`` ids on the wire.
    * ``factory()`` returns a fresh :class:`ChatProvider`. Cloud providers
      read their credentials from ``env_key`` on construction.
    * ``local=True`` implies ``env_key is None`` (no credentials required).
    """

    key: str
    local: bool
    factory: Callable[[], ChatProvider]
    default_context: int
    env_key: str | None = None

    def has_credentials(self) -> bool:
        """``True`` when the provider can be probed in the current env."""
        if self.env_key is None:
            return True
        return bool(os.environ.get(self.env_key))


PROVIDER_SPECS: list[ProviderSpec] = [
    ProviderSpec("ollama", local=True, factory=OllamaProvider, default_context=8_192),
    ProviderSpec("lmstudio", local=True, factory=LMStudioProvider, default_context=8_192),
    ProviderSpec("openai", local=False, factory=OpenAIProvider, default_context=128_000, env_key="OPENAI_API_KEY"),
    ProviderSpec(
        "anthropic", local=False, factory=AnthropicProvider, default_context=200_000, env_key="ANTHROPIC_API_KEY"
    ),
    ProviderSpec("google", local=False, factory=GoogleProvider, default_context=1_000_000, env_key="GOOGLE_API_KEY"),
]


# Convenience lookup. Built once at import time so the streaming hot
# path (``stream_chat_reply``) doesn't iterate over the list per call.
PROVIDERS_BY_KEY: dict[str, ProviderSpec] = {spec.key: spec for spec in PROVIDER_SPECS}
