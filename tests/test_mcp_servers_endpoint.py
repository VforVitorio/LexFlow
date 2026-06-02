"""Tests for ``/api/v1/mcp/servers`` (#122).

Covers:
    * `GET` returns built-ins + user entries.
    * `POST` adds a user entry; refuses built-in names and duplicates.
    * `PATCH` toggles `enabled` on a user entry; refuses built-ins.
    * `DELETE` is idempotent and refuses built-ins.
    * Persistence round-trips through the JSON file at `<config_dir>/mcp.json`.

The repo-wide ``_isolated_config_dir`` fixture in ``conftest.py`` already
points ``LEXFLOW_CONFIG_DIR`` at a per-test temp dir, so the writes
never touch the developer's real `~/.lexflow/`.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lexflow.mcp_servers import (
    BUILTIN_LEXFLOW_LEGAL_NAME,
    MCP_CONFIG_FILENAME,
)
from lexflow.utils.config import get_settings


@pytest.fixture(name="client")
def _client() -> TestClient:
    from lexflow.api.app import app

    return TestClient(app)


@pytest.fixture(name="mcp_config_path")
def _mcp_config_path() -> Path:
    return get_settings().config_dir / MCP_CONFIG_FILENAME


# ─── GET ─────────────────────────────────────────────────────────────────


class TestListServers:
    def test_returns_at_least_the_builtin_lexflow_legal(self, client: TestClient) -> None:
        body = client.get("/api/v1/mcp/servers").json()
        names = [item["name"] for item in body["items"]]
        assert BUILTIN_LEXFLOW_LEGAL_NAME in names

    def test_builtins_carry_kind_and_enabled(self, client: TestClient) -> None:
        body = client.get("/api/v1/mcp/servers").json()
        first = body["items"][0]
        assert first["kind"] == "builtin"
        assert first["enabled"] is True

    def test_user_servers_appear_after_builtins(self, client: TestClient, mcp_config_path: Path) -> None:
        client.post(
            "/api/v1/mcp/servers",
            json={
                "name": "context-mode",
                "description": "tool-output sandboxing",
                "command": {"command": "npx", "args": ["mksglu/context-mode"]},
            },
        )
        items = client.get("/api/v1/mcp/servers").json()["items"]
        # Built-ins land first; user entries follow in insertion order.
        assert items[0]["kind"] == "builtin"
        assert items[-1]["kind"] == "user"
        assert items[-1]["name"] == "context-mode"


# ─── POST ────────────────────────────────────────────────────────────────


class TestCreateServer:
    def test_persists_to_disk(self, client: TestClient, mcp_config_path: Path) -> None:
        response = client.post(
            "/api/v1/mcp/servers",
            json={
                "name": "test-foo",
                "description": "sample",
                "command": {"command": "uvx", "args": ["test-foo"], "env": {"FOO": "1"}},
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["kind"] == "user"
        assert body["enabled"] is True

        on_disk = json.loads(mcp_config_path.read_text(encoding="utf-8"))
        assert "test-foo" in on_disk["mcpServers"]
        assert on_disk["mcpServers"]["test-foo"]["command"] == "uvx"
        assert on_disk["lexflow_enabled"]["test-foo"] is True

    def test_refuses_builtin_name(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/mcp/servers",
            json={
                "name": BUILTIN_LEXFLOW_LEGAL_NAME,
                "command": {"command": "fake"},
            },
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "name_reserved"

    def test_refuses_duplicate_user_name(self, client: TestClient) -> None:
        body = {"name": "dup", "command": {"command": "foo"}}
        first = client.post("/api/v1/mcp/servers", json=body)
        assert first.status_code == 201
        second = client.post("/api/v1/mcp/servers", json=body)
        assert second.status_code == 409
        assert second.json()["detail"]["code"] == "name_taken"

    def test_refuses_invalid_name_pattern(self, client: TestClient) -> None:
        # Spaces, slashes only via @ org/, no other shell-unsafe glyphs.
        response = client.post(
            "/api/v1/mcp/servers",
            json={"name": "has space", "command": {"command": "foo"}},
        )
        assert response.status_code == 422


# ─── PATCH ───────────────────────────────────────────────────────────────


class TestPatchServer:
    def test_toggles_enabled(self, client: TestClient) -> None:
        client.post(
            "/api/v1/mcp/servers",
            json={"name": "toggle-me", "command": {"command": "foo"}},
        )
        response = client.patch(
            "/api/v1/mcp/servers/toggle-me",
            json={"enabled": False},
        )
        assert response.status_code == 200
        assert response.json()["enabled"] is False
        # And the next GET reflects it.
        items = client.get("/api/v1/mcp/servers").json()["items"]
        toggled = next(it for it in items if it["name"] == "toggle-me")
        assert toggled["enabled"] is False

    def test_refuses_builtin(self, client: TestClient) -> None:
        response = client.patch(
            f"/api/v1/mcp/servers/{BUILTIN_LEXFLOW_LEGAL_NAME}",
            json={"enabled": False},
        )
        assert response.status_code == 409

    def test_404_for_unknown_user_server(self, client: TestClient) -> None:
        response = client.patch(
            "/api/v1/mcp/servers/never-existed",
            json={"enabled": False},
        )
        assert response.status_code == 404

    def test_empty_patch_returns_400(self, client: TestClient) -> None:
        client.post(
            "/api/v1/mcp/servers",
            json={"name": "empty-patch", "command": {"command": "foo"}},
        )
        response = client.patch("/api/v1/mcp/servers/empty-patch", json={})
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "empty_patch"


# ─── DELETE ──────────────────────────────────────────────────────────────


class TestDeleteServer:
    def test_removes_user_entry(self, client: TestClient, mcp_config_path: Path) -> None:
        client.post(
            "/api/v1/mcp/servers",
            json={"name": "removable", "command": {"command": "foo"}},
        )
        response = client.delete("/api/v1/mcp/servers/removable")
        assert response.status_code == 204
        on_disk = json.loads(mcp_config_path.read_text(encoding="utf-8"))
        assert "removable" not in on_disk["mcpServers"]

    def test_is_idempotent(self, client: TestClient) -> None:
        # Sprint 5 api-3 convention — repeated DELETEs converge on 204.
        first = client.delete("/api/v1/mcp/servers/never-existed")
        assert first.status_code == 204
        second = client.delete("/api/v1/mcp/servers/never-existed")
        assert second.status_code == 204

    def test_refuses_builtin(self, client: TestClient) -> None:
        response = client.delete(f"/api/v1/mcp/servers/{BUILTIN_LEXFLOW_LEGAL_NAME}")
        assert response.status_code == 409


# ─── Persistence round-trip ─────────────────────────────────────────────


class TestPersistence:
    def test_servers_survive_list_reload(self, client: TestClient) -> None:
        """An entry written via POST shows up in a fresh GET — implicit
        proof the response isn't an in-memory artefact."""
        client.post(
            "/api/v1/mcp/servers",
            json={"name": "survivor", "command": {"command": "foo", "args": ["a", "b"]}},
        )
        items = client.get("/api/v1/mcp/servers").json()["items"]
        survivor = next(it for it in items if it["name"] == "survivor")
        assert survivor["command"]["args"] == ["a", "b"]

    def test_malformed_file_returns_only_builtins(self, client: TestClient, mcp_config_path: Path) -> None:
        mcp_config_path.write_text("not json at all", encoding="utf-8")
        items = client.get("/api/v1/mcp/servers").json()["items"]
        kinds = {item["kind"] for item in items}
        assert "user" not in kinds
        assert "builtin" in kinds
