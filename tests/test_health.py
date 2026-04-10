"""Tests for the /health endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

import lexflow


def test_health_returns_ok(client: TestClient) -> None:
    """GET /health returns 200 with status ok."""
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_health_contains_version(client: TestClient) -> None:
    """Response includes the current package version."""
    response = client.get("/health")

    body = response.json()
    assert body["version"] == lexflow.__version__
