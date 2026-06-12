"""Tests for the in-app ``[semantic]`` extra install endpoint (#578).

Covers the command resolver (the pure, env-dependent decision) and the two
endpoint paths that don't spawn a real multi-GB subprocess: the 429 busy
guard and the "no install path available" error event.
"""

from __future__ import annotations

import sys

import pytest
from fastapi.testclient import TestClient

from lexflow.api.routers import system


class TestResolveInstallCommand:
    def test_returns_none_when_frozen(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A frozen PyInstaller build has no pip/uv — no runtime install."""
        monkeypatch.setattr(sys, "frozen", True, raising=False)
        assert system._resolve_install_command() is None

    def test_prefers_uv_when_on_path(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sys, "frozen", False, raising=False)
        monkeypatch.setattr(system.shutil, "which", lambda _name: "/usr/bin/uv")
        command = system._resolve_install_command()
        assert command is not None
        assert command[:3] == ["/usr/bin/uv", "pip", "install"]
        assert command[-1] == system._SEMANTIC_PACKAGE

    def test_falls_back_to_pip_when_no_uv(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sys, "frozen", False, raising=False)
        monkeypatch.setattr(system.shutil, "which", lambda _name: None)
        command = system._resolve_install_command()
        assert command is not None
        assert command[0] == sys.executable
        assert "pip" in command and "install" in command
        assert command[-1] == system._SEMANTIC_PACKAGE


class TestSemanticInstallEndpoint:
    def test_busy_returns_429(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        """A second install while one runs gets a clean 429, not a clash."""
        monkeypatch.setattr(system._SEMANTIC_INSTALL_LOCK, "locked", lambda: True)
        response = client.post("/api/v1/system/semantic-install")
        assert response.status_code == 429
        assert response.json()["detail"]["code"] == "semantic_install_busy"

    def test_unavailable_streams_single_error_event(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        """No usable install path → one ``error`` SSE event, no subprocess."""
        monkeypatch.setattr(system, "_resolve_install_command", lambda: None)
        response = client.post("/api/v1/system/semantic-install")
        assert response.status_code == 200
        assert "event: error" in response.text
        assert "semantic_install_unavailable" in response.text
