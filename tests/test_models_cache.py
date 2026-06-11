"""#554 — the /models endpoint caches provider probes for a short TTL.

Probing all providers costs ~2.25 s; these guard that repeat calls within
the TTL skip the probe, and that ``?refresh=true`` bypasses the cache.
"""

from __future__ import annotations

import pytest

from lexflow.api.routers import models as models_router


@pytest.fixture(autouse=True)
def _clear_cache():
    models_router._reset_models_cache()
    yield
    models_router._reset_models_cache()


@pytest.mark.asyncio
async def test_repeat_calls_within_ttl_skip_the_probe(monkeypatch) -> None:
    calls = {"n": 0}

    async def fake_probe(_spec):
        calls["n"] += 1
        return ["model"]

    # One fake provider so each uncached call triggers exactly one probe.
    monkeypatch.setattr(models_router.provider_registry, "PROVIDER_SPECS", ["spec"])
    monkeypatch.setattr(models_router, "_probe", fake_probe)

    await models_router.list_models(refresh=False)  # miss → probe (1)
    await models_router.list_models(refresh=False)  # hit → no probe
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_refresh_true_bypasses_the_cache(monkeypatch) -> None:
    calls = {"n": 0}

    async def fake_probe(_spec):
        calls["n"] += 1
        return ["model"]

    monkeypatch.setattr(models_router.provider_registry, "PROVIDER_SPECS", ["spec"])
    monkeypatch.setattr(models_router, "_probe", fake_probe)

    await models_router.list_models(refresh=False)  # miss → probe (1)
    await models_router.list_models(refresh=True)  # bypass → probe (2)
    assert calls["n"] == 2
