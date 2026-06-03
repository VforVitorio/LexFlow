"""Tests for opt-in telemetry (#74).

Verifies the two-gate model:
  * Backend gate: ``LEXFLOW_TELEMETRY_ENABLED`` env var.
  * Frontend gate: enforced by the SPA (covered elsewhere).

The route always returns 202 so the SPA never sees an error from a
fire-and-forget telemetry call. Persistence is gated by the env var.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch


@pytest.fixture()
def _isolated_config_dir(tmp_path: Path, monkeypatch: MonkeyPatch) -> Path:
    monkeypatch.setenv("LEXFLOW_CONFIG_DIR", str(tmp_path))
    # The settings singleton caches reads; clear it so the env override sticks.
    from lexflow.utils.config import get_settings

    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


class TestStatusEndpoint:
    def test_off_by_default(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.delenv("LEXFLOW_TELEMETRY_ENABLED", raising=False)
        response = client.get("/api/v1/telemetry/status")
        assert response.status_code == 200
        assert response.json() == {"enabled": False}

    def test_on_when_env_is_truthy(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "1")
        assert client.get("/api/v1/telemetry/status").json() == {"enabled": True}
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "true")
        assert client.get("/api/v1/telemetry/status").json() == {"enabled": True}
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "yes")
        assert client.get("/api/v1/telemetry/status").json() == {"enabled": True}

    def test_off_for_other_values(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "0")
        assert client.get("/api/v1/telemetry/status").json() == {"enabled": False}
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "no")
        assert client.get("/api/v1/telemetry/status").json() == {"enabled": False}
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "")
        assert client.get("/api/v1/telemetry/status").json() == {"enabled": False}


class TestIngest:
    def test_accepted_but_dropped_when_disabled(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
        _isolated_config_dir: Path,
    ) -> None:
        monkeypatch.delenv("LEXFLOW_TELEMETRY_ENABLED", raising=False)
        response = client.post(
            "/api/v1/telemetry/events",
            json={"events": [{"name": "page_view", "props": {"path": "/home"}}]},
        )
        assert response.status_code == 202
        body = response.json()
        assert body["accepted"] == 0
        assert body["enabled"] is False
        # Nothing written to disk.
        assert list((_isolated_config_dir / "telemetry").glob("*.jsonl")) == []

    def test_persisted_when_enabled(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
        _isolated_config_dir: Path,
    ) -> None:
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "1")
        response = client.post(
            "/api/v1/telemetry/events",
            json={
                "events": [
                    {"name": "page_view", "props": {"path": "/home"}},
                    {"name": "palette_command", "props": {"id": "open-settings"}},
                ]
            },
        )
        assert response.status_code == 202
        assert response.json() == {"accepted": 2, "enabled": True}

        files = list((_isolated_config_dir / "telemetry").glob("*.jsonl"))
        assert len(files) == 1
        lines = files[0].read_text(encoding="utf-8").strip().split("\n")
        assert len(lines) == 2
        first = json.loads(lines[0])
        assert first["name"] == "page_view"
        assert first["props"] == {"path": "/home"}
        assert first["ts"].endswith("Z")

    def test_empty_batch_is_a_noop(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
        _isolated_config_dir: Path,
    ) -> None:
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "1")
        response = client.post("/api/v1/telemetry/events", json={"events": []})
        assert response.status_code == 202
        assert response.json()["accepted"] == 0
        assert list((_isolated_config_dir / "telemetry").glob("*.jsonl")) == []

    def test_batch_size_cap_rejects_oversized_payloads(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LEXFLOW_TELEMETRY_ENABLED", "1")
        oversized = {"events": [{"name": "page_view", "props": {}} for _ in range(51)]}
        response = client.post("/api/v1/telemetry/events", json=oversized)
        assert response.status_code == 422
