"""Tests for the cloud-provider rate limiter (#93).

The bucket is per-process and configured via env vars. Each test:
  * Sets the env var it cares about.
  * Calls ``reset_buckets()`` so a prior test's bucket (different rpm)
    doesn't leak in.
  * Exercises ``acquire(...)`` and inspects the outcome.

The :class:`monkeypatch` fixture restores env vars after the test, so
no manual cleanup is needed for the env knobs themselves.
"""

from __future__ import annotations

import asyncio

import pytest

from lexflow.chat.rate_limit import (
    RateLimitedError,
    TokenBucket,
    acquire,
    reset_buckets,
)


@pytest.fixture(autouse=True)
def _clean_buckets() -> None:
    """Buckets are module-level singletons — drop them between tests."""
    reset_buckets()


class TestTokenBucket:
    @pytest.mark.asyncio
    async def test_allows_calls_up_to_capacity(self) -> None:
        bucket = TokenBucket(rate_per_minute=5)
        for _ in range(5):
            allowed, retry_after_s = await bucket.try_acquire()
            assert allowed is True
            assert retry_after_s == 0.0

    @pytest.mark.asyncio
    async def test_blocks_after_capacity_with_retry_after(self) -> None:
        bucket = TokenBucket(rate_per_minute=2)
        await bucket.try_acquire()
        await bucket.try_acquire()
        allowed, retry_after_s = await bucket.try_acquire()
        assert allowed is False
        # 2 rpm = 1 token / 30s; without elapsed time, retry ≈ 30s.
        assert 25.0 < retry_after_s < 31.0

    @pytest.mark.asyncio
    async def test_zero_rate_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            TokenBucket(rate_per_minute=0)

    @pytest.mark.asyncio
    async def test_negative_rate_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            TokenBucket(rate_per_minute=-1)


class TestAcquire:
    @pytest.mark.asyncio
    async def test_local_providers_pass_through_with_no_env(self) -> None:
        # No env var maps to ollama / lmstudio — pass-through.
        await acquire("ollama")
        await acquire("lmstudio")

    @pytest.mark.asyncio
    async def test_cloud_provider_with_unset_env_passes_through(self) -> None:
        # Env unset → no bucket → no limit.
        await acquire("openai")
        await acquire("anthropic")
        await acquire("google")

    @pytest.mark.asyncio
    async def test_openai_bucket_blocks_after_capacity(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_RATE_OPENAI_RPM", "3")
        await acquire("openai")
        await acquire("openai")
        await acquire("openai")
        with pytest.raises(RateLimitedError) as excinfo:
            await acquire("openai")
        assert excinfo.value.provider_key == "openai"
        assert excinfo.value.retry_after_s > 0

    @pytest.mark.asyncio
    async def test_per_provider_buckets_are_independent(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LEXFLOW_RATE_OPENAI_RPM", "1")
        monkeypatch.setenv("LEXFLOW_RATE_ANTHROPIC_RPM", "1")
        await acquire("openai")
        # OpenAI is now empty; Anthropic still has its own token.
        await acquire("anthropic")
        with pytest.raises(RateLimitedError):
            await acquire("openai")

    @pytest.mark.asyncio
    async def test_invalid_env_value_disables_limit(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LEXFLOW_RATE_OPENAI_RPM", "not-a-number")
        for _ in range(10):
            await acquire("openai")

    @pytest.mark.asyncio
    async def test_zero_env_value_disables_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_RATE_OPENAI_RPM", "0")
        for _ in range(10):
            await acquire("openai")

    @pytest.mark.asyncio
    async def test_concurrent_acquires_respect_capacity(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LEXFLOW_RATE_OPENAI_RPM", "5")

        async def _attempt() -> bool:
            try:
                await acquire("openai")
                return True
            except RateLimitedError:
                return False

        # 10 concurrent attempts on a bucket of 5 → 5 pass, 5 are rejected.
        results = await asyncio.gather(*(_attempt() for _ in range(10)))
        allowed = sum(1 for r in results if r)
        rejected = sum(1 for r in results if not r)
        assert allowed == 5
        assert rejected == 5
