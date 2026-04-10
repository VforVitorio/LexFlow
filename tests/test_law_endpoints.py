"""Tests for GET /api/v1/laws and GET /api/v1/laws/{law_id} endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from lexflow.core.registry import LawRegistry


class TestListLaws:
    def test_returns_paginated(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws")
        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body

    def test_default_pagination(self, client: TestClient, mock_registry: LawRegistry) -> None:
        body = client.get("/api/v1/laws").json()
        assert body["page"] == 1
        assert body["page_size"] == 20

    def test_contains_expected_laws(self, client: TestClient, mock_registry: LawRegistry) -> None:
        body = client.get("/api/v1/laws").json()
        identifiers = [item["identifier"] for item in body["items"]]
        assert "BOE-A-2000-323" in identifiers
        assert "BOE-A-2018-16673" in identifiers

    def test_filter_by_rank(self, client: TestClient, mock_registry: LawRegistry) -> None:
        body = client.get("/api/v1/laws", params={"rank": "ley_organica"}).json()
        for item in body["items"]:
            assert item["rank"] == "ley_organica"

    def test_filter_returns_empty_for_no_match(self, client: TestClient, mock_registry: LawRegistry) -> None:
        body = client.get("/api/v1/laws", params={"rank": "orden"}).json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_pagination_params(self, client: TestClient, mock_registry: LawRegistry) -> None:
        body = client.get("/api/v1/laws", params={"page": 1, "page_size": 1}).json()
        assert len(body["items"]) == 1
        assert body["total"] == 2
        assert body["has_next"] is True


class TestGetLaw:
    def test_found(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/BOE-A-2000-323")
        assert response.status_code == 200
        body = response.json()
        assert body["metadata"]["identifier"] == "BOE-A-2000-323"

    def test_includes_articles(self, client: TestClient, mock_registry: LawRegistry) -> None:
        body = client.get("/api/v1/laws/BOE-A-2000-323").json()
        assert body["article_count"] > 0
        assert len(body["articles"]) == body["article_count"]

    def test_not_found(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/NONEXISTENT-123")
        assert response.status_code == 404
        body = response.json()
        assert body["error"] == "LawNotFound"
