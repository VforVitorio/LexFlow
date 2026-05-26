"""Tests for ``/api/v1/sync/*`` (issue #86).

Monkeypatches the ``_Git`` boundary so we don't shell out to a real
submodule or remote during the suite. Covers:

* ``GET /sync/status`` envelope shape;
* fields populated from the git wrapper;
* ``POST /sync/run`` returns 202 and clears the busy flag on completion;
* graph cache is invalidated after a successful sync;
* a second concurrent call returns 409.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch


class _FakeGit:
    """Stand-in for ``_Git`` — returns canned values for each git call."""

    def __init__(self, *, head: datetime | None, upstream: str, behind: int, pull_ok: bool = True) -> None:
        self._head = head
        self._upstream = upstream
        self._behind = behind
        self._pull_ok = pull_ok
        self.pull_called = 0

    def head_iso_date(self) -> datetime | None:
        return self._head

    def upstream_branch(self) -> str:
        return self._upstream

    def behind_count(self) -> int:
        return self._behind

    def pull(self) -> bool:
        self.pull_called += 1
        return self._pull_ok


@pytest.fixture()
def patch_git(monkeypatch: MonkeyPatch):
    """Install a fake git factory and reset the busy flag between tests."""

    def _install(**kwargs: object) -> _FakeGit:
        from lexflow.sync import legalize as legalize_mod

        fake = _FakeGit(
            head=kwargs.get("head"),  # type: ignore[arg-type]
            upstream=kwargs.get("upstream", "origin/main"),  # type: ignore[arg-type]
            behind=kwargs.get("behind", 0),  # type: ignore[arg-type]
            pull_ok=kwargs.get("pull_ok", True),  # type: ignore[arg-type]
        )
        monkeypatch.setattr(legalize_mod, "_git_factory", lambda _path: fake)
        # Reset the module-level state in case a prior test left it set.
        with legalize_mod._state_lock:
            legalize_mod._state.running = False
        return fake

    return _install


class TestSyncStatus:
    def test_returns_envelope_shape(self, client: TestClient, patch_git) -> None:
        patch_git()
        response = client.get("/api/v1/sync/status")
        assert response.status_code == 200
        body = response.json()
        assert set(body.keys()) == {"last_sync_at", "upstream", "behind", "busy"}

    def test_fields_reflect_git_wrapper(self, client: TestClient, patch_git) -> None:
        head = datetime(2026, 5, 24, 12, 0, tzinfo=UTC)
        patch_git(head=head, upstream="origin/main", behind=3)
        body = client.get("/api/v1/sync/status").json()
        assert body["last_sync_at"].startswith("2026-05-24T12:00:00")
        assert body["upstream"] == "origin/main"
        assert body["behind"] == 3
        assert body["busy"] is False

    def test_handles_missing_upstream_gracefully(self, client: TestClient, patch_git) -> None:
        patch_git(head=None, upstream="", behind=0)
        body = client.get("/api/v1/sync/status").json()
        assert body["last_sync_at"] is None
        assert body["upstream"] == ""
        assert body["behind"] == 0


class TestSyncRun:
    def test_run_returns_202_and_invokes_pull(self, client: TestClient, patch_git) -> None:
        fake = patch_git()
        response = client.post("/api/v1/sync/run")
        assert response.status_code == 202
        body = response.json()
        assert body["started"] is True
        assert fake.pull_called == 1

    def test_run_invalidates_graph_cache(self, client: TestClient, patch_git) -> None:
        patch_git()
        from lexflow.api import dependencies as deps_mod

        # Seed the cache so we can prove the invalidator ran. Touch the
        # DI provider's module-level cache directly — the same singleton
        # the production code reads through ``get_graph``.
        deps_mod._cached_graph = object()  # type: ignore[assignment]
        client.post("/api/v1/sync/run")
        assert deps_mod._cached_graph is None

    def test_concurrent_run_returns_409(self, client: TestClient, monkeypatch: MonkeyPatch, patch_git) -> None:
        """While one pull is in flight, a second call must 409."""
        patch_git()
        from lexflow.sync import legalize as legalize_mod

        # Force `is_sync_running()` to return True so the second branch fires.
        with legalize_mod._state_lock:
            legalize_mod._state.running = True
        try:
            response = client.post("/api/v1/sync/run")
            assert response.status_code == 409
            assert response.json()["started"] is False
        finally:
            with legalize_mod._state_lock:
                legalize_mod._state.running = False

    def test_run_clears_busy_flag(self, client: TestClient, patch_git) -> None:
        patch_git()
        from lexflow.sync import legalize as legalize_mod

        client.post("/api/v1/sync/run")
        assert legalize_mod.is_sync_running() is False


class TestRunSyncInternals:
    """Direct tests on the async ``run_sync`` to guard the lock semantics."""

    def test_run_sync_skips_when_busy(self, patch_git) -> None:
        patch_git()
        from lexflow.sync import legalize as legalize_mod

        with legalize_mod._state_lock:
            legalize_mod._state.running = True
        try:
            started = asyncio.run(legalize_mod.run_sync())
        finally:
            with legalize_mod._state_lock:
                legalize_mod._state.running = False
        assert started is False

    def test_run_sync_invokes_on_complete(self, patch_git) -> None:
        patch_git()
        from lexflow.sync import legalize as legalize_mod

        with legalize_mod._state_lock:
            legalize_mod._state.running = False
        called: list[bool] = []
        asyncio.run(legalize_mod.run_sync(on_complete=lambda: called.append(True)))
        assert called == [True]
