"""Tests for the CSRF boundary on spawn/state-changing routes (#885, S1.2).

The repo-wide ``client`` fixture (``tests/conftest.py``) already carries
the required header on every request, matching what the real SPA sends
(``frontend/src/lib/api/http.ts``). These tests build a *bare* client
without that default to exercise the rejection path, plus confirm the
header-carrying client still gets through.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.api.app import app
from lexflow.api.csrf_boundary import PROTECTED_PATHS
from lexflow.utils.config import get_settings

HEADER_NAME = "X-Lexflow-Client"
HEADER_VALUE = "spa"


@pytest.fixture(name="bare_client")
def _bare_client() -> TestClient:
    """A client with NO default headers — simulates a bare cross-origin request."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestProtectedRoutesRejectWithoutHeader:
    """Every route in PROTECTED_PATHS must 403 without the CSRF header."""

    def test_sync_post_rejected(self, bare_client: TestClient) -> None:
        response = bare_client.post("/api/v1/sync")
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "csrf_header_required"

    def test_sync_run_post_rejected(self, bare_client: TestClient) -> None:
        response = bare_client.post("/api/v1/sync/run")
        assert response.status_code == 403

    def test_semantic_install_post_rejected(self, bare_client: TestClient) -> None:
        response = bare_client.post("/api/v1/system/semantic-install")
        assert response.status_code == 403

    def test_mcp_tools_get_rejected(self, bare_client: TestClient) -> None:
        response = bare_client.get("/api/v1/mcp/tools")
        assert response.status_code == 403

    def test_mcp_bundles_post_rejected(self, bare_client: TestClient) -> None:
        response = bare_client.post(
            "/api/v1/mcp/bundles",
            files={"file": ("x.mcpb", b"not a real zip", "application/zip")},
        )
        assert response.status_code == 403

    def test_wrong_header_value_rejected(self, bare_client: TestClient) -> None:
        response = bare_client.post("/api/v1/sync", headers={HEADER_NAME: "not-the-spa"})
        assert response.status_code == 403


class TestProtectedRoutesAllowWithHeader:
    """The header alone (no Origin) is enough to pass the boundary."""

    def test_sync_status_get_is_not_protected(self, bare_client: TestClient) -> None:
        # GET /sync/status isn't in the spawn/mutate subset — unaffected.
        response = bare_client.get("/api/v1/sync/status")
        assert response.status_code == 200

    def test_mcp_tools_get_allowed_with_header(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        from lexflow.api.routers import mcp_servers as router_mod

        async def _fake_list_all() -> list:
            return []

        monkeypatch.setattr(router_mod, "list_all_external_tools", _fake_list_all)
        response = client.get("/api/v1/mcp/tools")
        assert response.status_code == 200

    def test_semantic_install_allowed_with_header(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        from lexflow.api.routers import system as system_mod

        monkeypatch.setattr(system_mod, "_resolve_install_command", lambda: None)
        response = client.post("/api/v1/system/semantic-install")
        assert response.status_code == 200


class TestOriginAllowList:
    """Origin is only checked when the browser actually sends one."""

    def test_allowed_origin_passes(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        from lexflow.api.routers import system as system_mod

        monkeypatch.setattr(system_mod, "_resolve_install_command", lambda: None)
        response = client.post(
            "/api/v1/system/semantic-install",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 200

    def test_disallowed_origin_rejected_even_with_header(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/sync",
            headers={"Origin": "https://evil.example.com"},
        )
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "csrf_origin_rejected"

    def test_no_origin_header_skips_origin_check(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        # Non-browser tools (curl, server-to-server) don't send Origin at
        # all — only the required header gates them.
        from lexflow.api.routers import sync as sync_mod

        monkeypatch.setattr(
            sync_mod.subprocess,
            "run",
            lambda *a, **k: type("R", (), {"stdout": "ok", "stderr": ""})(),
        )
        monkeypatch.setattr(sync_mod, "submodule_hash", lambda _p: "unchanged")
        monkeypatch.setattr(sync_mod, "get_registry", lambda: None)
        response = client.post("/api/v1/sync")
        assert response.status_code == 200


class TestProtectedPathsCoverage:
    def test_expected_paths_are_protected(self) -> None:
        assert {
            "/api/v1/sync",
            "/api/v1/sync/run",
            "/api/v1/system/semantic-install",
            "/api/v1/mcp/tools",
            "/api/v1/mcp/bundles",
        } == PROTECTED_PATHS
