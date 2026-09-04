"""Tests for article endpoints."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_law_registry
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
        body = response.json()
        # See test_law_endpoints::test_not_found for the envelope contract.
        assert body["code"] == "article_not_found"
        assert "999" in body["detail"]

    def test_with_trailing_dot(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/BOE-A-2000-323/articles/1.")
        assert response.status_code == 200


@pytest.fixture()
def duplicate_article_client(tmp_path: Path) -> Iterator[TestClient]:
    """A law whose article "2" repeats — e.g. an annex statute (#824)."""
    frontmatter = 'title: "Norma con anexos"\nidentifier: "TEST-DUP"\ncountry: "es"\nrank: "otro"\n'
    body = (
        "# Norma con anexos\n\n"
        "###### Articulo 2. Autoridades competentes.\n\n"
        "Texto del primer anexo.\n\n"
        "###### Articulo 2. Autoridades competentes.\n\n"
        "Texto del segundo anexo.\n"
    )
    law_file = tmp_path / "es" / "TEST-DUP.md"
    law_file.parent.mkdir(parents=True, exist_ok=True)
    law_file.write_text(f"---\n{frontmatter}---\n{body}", encoding="utf-8")

    registry = LawRegistry(tmp_path)
    registry.preload_all_metadata()
    app.dependency_overrides[get_law_registry] = lambda: registry
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestGetArticleOccurrence:
    """#824: annex statutes embedded in the same law repeat article ids."""

    def test_default_occurrence_returns_first_match(self, duplicate_article_client: TestClient) -> None:
        response = duplicate_article_client.get("/api/v1/laws/TEST-DUP/articles/2")
        assert response.status_code == 200
        assert "primer anexo" in response.json()["article"]["text"]

    def test_occurrence_two_returns_second_match(self, duplicate_article_client: TestClient) -> None:
        response = duplicate_article_client.get(
            "/api/v1/laws/TEST-DUP/articles/2",
            params={"occurrence": 2},
        )
        assert response.status_code == 200
        assert "segundo anexo" in response.json()["article"]["text"]

    def test_occurrence_beyond_matches_404s(self, duplicate_article_client: TestClient) -> None:
        response = duplicate_article_client.get(
            "/api/v1/laws/TEST-DUP/articles/2",
            params={"occurrence": 3},
        )
        assert response.status_code == 404
