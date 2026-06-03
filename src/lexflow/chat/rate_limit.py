"""Per-provider token-bucket rate limiting for cloud chat APIs (#93).

Cloud providers (OpenAI / Anthropic / Google) bill per request and
enforce aggressive per-minute caps. If a user opens 20 chat threads at
once, naive fan-out burns through the key in seconds. This module
gates outbound provider calls with a token bucket per provider key,
configured via env vars (one knob per provider, opt-in).

Local providers (``ollama``, ``lmstudio``) are never rate-limited —
they run on the user's own hardware and the bottleneck is GPU, not
quota.

Wire contract
-------------

The router calls :func:`acquire` *before* opening the SSE stream. When
the bucket is empty, :class:`RateLimitedError` is raised with a
``retry_after_s`` payload. The router translates that into an HTTP
429 + ``Retry-After`` header so the frontend can show
"Slow down, retry in N seconds".

Env knobs
---------

* ``LEXFLOW_RATE_OPENAI_RPM``     — requests per minute, OpenAI.
* ``LEXFLOW_RATE_ANTHROPIC_RPM``  — same, Anthropic.
* ``LEXFLOW_RATE_GOOGLE_RPM``     — same, Google Gemini.

Unset or non-positive → no bucket → no limit (pass-through).

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new cloud provider          → extend :data:`_ENV_BY_PROVIDER`.
* Switch to a sliding-window algo   → replace :class:`TokenBucket` and
                                       keep the public surface
                                       (``acquire`` / ``RateLimitedError``).
* Per-user / per-thread limiting    → bucket key becomes
                                       ``f"{provider}:{user_id}"``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)


_ENV_BY_PROVIDER: dict[str, str] = {
    "openai": "LEXFLOW_RATE_OPENAI_RPM",
    "anthropic": "LEXFLOW_RATE_ANTHROPIC_RPM",
    "google": "LEXFLOW_RATE_GOOGLE_RPM",
}


class RateLimitedError(Exception):
    """Raised when a provider's bucket has no tokens left.

    Attributes:
        provider_key: The string key (e.g. ``"openai"``).
        retry_after_s: Seconds the caller should wait before retrying.
    """

    def __init__(self, provider_key: str, retry_after_s: float) -> None:
        super().__init__(f"Rate limit for {provider_key!r}; retry in {retry_after_s:.1f}s")
        self.provider_key = provider_key
        self.retry_after_s = retry_after_s


@dataclass
class _BucketState:
    """Mutable per-bucket book-keeping. Kept out of the public surface."""

    capacity: int
    refill_per_second: float
    tokens: float
    last_refill: float
    lock: asyncio.Lock


class TokenBucket:
    """Async-safe token bucket.

    One bucket per provider key. ``capacity = rpm`` (a one-minute burst
    window); ``refill_per_second = rpm / 60``. Every call to
    :meth:`try_acquire` refills proportional to wall-clock elapsed
    since the last call.

    The bucket is intentionally process-local — sufficient for the
    desktop-app distribution target. A multi-worker deployment would
    need a shared backend (Redis), tracked as follow-up under #74.
    """

    def __init__(self, rate_per_minute: int) -> None:
        if rate_per_minute <= 0:
            raise ValueError("rate_per_minute must be positive")
        self._state = _BucketState(
            capacity=rate_per_minute,
            refill_per_second=rate_per_minute / 60.0,
            tokens=float(rate_per_minute),
            last_refill=time.monotonic(),
            lock=asyncio.Lock(),
        )

    async def try_acquire(self) -> tuple[bool, float]:
        """Attempt to take one token.

        Returns:
            ``(allowed, retry_after_s)``. When ``allowed`` is True,
            ``retry_after_s`` is 0. When False, it is the wall-clock
            seconds the caller should wait for one token to refill.
        """
        async with self._state.lock:
            self._refill_locked()
            if self._state.tokens >= 1.0:
                self._state.tokens -= 1.0
                return True, 0.0
            tokens_needed = 1.0 - self._state.tokens
            retry_after_s = tokens_needed / self._state.refill_per_second
            return False, retry_after_s

    def _refill_locked(self) -> None:
        now = time.monotonic()
        elapsed = now - self._state.last_refill
        if elapsed <= 0:
            return
        added = elapsed * self._state.refill_per_second
        self._state.tokens = min(self._state.capacity, self._state.tokens + added)
        self._state.last_refill = now


_BUCKETS: dict[str, TokenBucket] = {}
_REGISTRY_LOCK = asyncio.Lock()


def _sanitize_for_log(value: str) -> str:
    """Remove control characters that could forge/split log entries."""
    return "".join(ch for ch in value if ch >= " " and ch != "\x7f")


def _read_rpm(provider_key: str) -> int | None:
    """Read ``LEXFLOW_RATE_<PROVIDER>_RPM`` and parse it.

    Returns the integer rpm when set to a positive number, ``None``
    when unset, empty, zero, negative or non-numeric. ``None`` means
    "no bucket / pass-through".
    """
    env_name = _ENV_BY_PROVIDER.get(provider_key)
    if env_name is None:
        return None
    raw = os.environ.get(env_name, "").strip()
    if not raw:
        return None
    try:
        rpm = int(raw)
    except ValueError:
        safe_provider_key = _sanitize_for_log(provider_key)
        logger.warning("Invalid %s=%r; disabling rate limit for %s", env_name, raw, safe_provider_key)
        return None
    if rpm <= 0:
        return None
    return rpm


async def _get_or_create_bucket(provider_key: str) -> TokenBucket | None:
    """Lazily create the bucket for ``provider_key`` if its env is set."""
    bucket = _BUCKETS.get(provider_key)
    if bucket is not None:
        return bucket
    async with _REGISTRY_LOCK:
        # Re-check under the lock — another coroutine may have created it.
        bucket = _BUCKETS.get(provider_key)
        if bucket is not None:
            return bucket
        rpm = _read_rpm(provider_key)
        if rpm is None:
            return None
        bucket = TokenBucket(rpm)
        _BUCKETS[provider_key] = bucket
        logger.info("Rate limit enabled for %s at %d rpm", provider_key, rpm)
        return bucket


async def acquire(provider_key: str) -> None:
    """Take one token from ``provider_key``'s bucket (if it has one).

    Raises:
        RateLimitedError: When the bucket is empty.

    Local providers (``ollama``, ``lmstudio``) and unconfigured cloud
    providers pass through with no-op.
    """
    bucket = await _get_or_create_bucket(provider_key)
    if bucket is None:
        return
    allowed, retry_after_s = await bucket.try_acquire()
    if not allowed:
        raise RateLimitedError(provider_key, retry_after_s)


def reset_buckets() -> None:
    """Drop all buckets — for tests that mutate the env between cases."""
    _BUCKETS.clear()
