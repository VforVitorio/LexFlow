"""Tests for the extended health snapshot (#74).

The new endpoint lives at ``/api/v1/system/health``; the legacy
unprefixed ``/health`` stays a one-liner. Both contracts are
covered here so a future refactor can't silently flip them.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


class TestLegacyHealthStaysSimple:
    """The unprefixed ``/health`` must remain cheap.

    Liveness probes (docker, k8s, uvicorn) hit it once a second; any
    disk/db work here would amplify into a constant load. If extra
    fields are ever added, do it on the v1 endpoint instead.
    """

    def test_returns_status_and_version_only(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["version"]
        assert set(payload.keys()) == {"status", "version"}


class TestExtendedHealth:
    """The v1 endpoint emits the full snapshot."""

    def test_payload_carries_every_probe(self, client: TestClient) -> None:
        response = client.get("/api/v1/system/health")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] in {"ok", "degraded"}
        assert payload["version"]
        assert payload["uptime_seconds"] >= 0
        assert "rss_mb" in payload["memory"]
        assert "system_used_percent" in payload["memory"]
        assert "total_gb" in payload["disk"]
        assert "free_gb" in payload["disk"]
        assert "used_percent" in payload["disk"]
        assert "submodule_present" in payload["corpus"]
        assert "laws_indexed" in payload["corpus"]
        assert "reachable" in payload["chat_db"]

    def test_chat_db_is_reachable_under_normal_conditions(self, client: TestClient) -> None:
        # On a freshly-booted test process the corpus dir may be absent
        # (tests don't pull the submodule), so we allow ``status`` to be
        # degraded — but require chat_db reachability, which is the one
        # piece the process owns end-to-end.
        response = client.get("/api/v1/system/health")
        payload = response.json()
        assert payload["chat_db"]["reachable"] is True

    def test_uptime_is_monotonically_non_negative(self, client: TestClient) -> None:
        first = client.get("/api/v1/system/health").json()["uptime_seconds"]
        second = client.get("/api/v1/system/health").json()["uptime_seconds"]
        assert second >= first
