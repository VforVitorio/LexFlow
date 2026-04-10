"""Tests for the GET /api/v1/search endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

from lexflow.core.registry import LawRegistry


class TestSearchEndpoint:
    def test_requires_query(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/search")
        assert response.status_code == 422  # Missing required param

    def test_min_length(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/search", params={"q": "a"})
        assert response.status_code == 422

    def test_returns_results(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/search", params={"q": "Enjuiciamiento"})
        assert response.status_code == 200
        body = response.json()
        assert body["query"] == "Enjuiciamiento"
        assert body["total"] > 0
        assert len(body["items"]) > 0

    def test_no_results(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/search", params={"q": "xyznonexistent"})
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 0
