"""Tests for article endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from lexflow.core.registry import LawRegistry


class TestListArticles:
    def test_returns_paginated(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/BOE-A-2000-323/articles")
        assert response.status_code == 200
        body = response.json()
        assert "items" in body
        assert "total" in body
        assert body["total"] > 0

    def test_law_not_found(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/NONEXISTENT/articles")
        assert response.status_code == 404

    def test_pagination(self, client: TestClient, mock_registry: LawRegistry) -> None:
        body = client.get(
            "/api/v1/laws/BOE-A-2000-323/articles",
            params={"page_size": 1},
        ).json()
        assert len(body["items"]) == 1
        assert body["total"] > 1


class TestGetArticle:
    def test_found(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/BOE-A-2000-323/articles/1")
        assert response.status_code == 200
        body = response.json()
        assert body["article"]["number"] == "1"
        assert body["law_id"] == "BOE-A-2000-323"

    def test_not_found(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/BOE-A-2000-323/articles/999")
        assert response.status_code == 404
        assert response.json()["error"] == "ArticleNotFound"

    def test_with_trailing_dot(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/BOE-A-2000-323/articles/1.")
        assert response.status_code == 200
