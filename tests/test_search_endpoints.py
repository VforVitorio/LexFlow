"""Tests for the search endpoints (#102 — canonical + deprecated alias).

Canonical: ``/api/v1/laws/search``. Deprecated alias: ``/api/v1/search``
(emits a ``Deprecation: true`` header). Both share the same logic, so we
parametrise the behavioural tests across both paths and add dedicated
tests for the deprecation header + route-ordering (the canonical path
must not be swallowed by ``/laws/{law_id}``).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from lexflow.core.registry import LawRegistry

_CANONICAL = "/api/v1/laws/search"
_DEPRECATED = "/api/v1/search"


@pytest.mark.parametrize("path", [_CANONICAL, _DEPRECATED])
class TestSearchBehaviour:
    def test_requires_query(self, client: TestClient, mock_registry: LawRegistry, path: str) -> None:
        del mock_registry
        assert client.get(path).status_code == 422

    def test_min_length(self, client: TestClient, mock_registry: LawRegistry, path: str) -> None:
        del mock_registry
        assert client.get(path, params={"q": "a"}).status_code == 422

    def test_returns_results(self, client: TestClient, mock_registry: LawRegistry, path: str) -> None:
        del mock_registry
        response = client.get(path, params={"q": "Enjuiciamiento"})
        assert response.status_code == 200
        body = response.json()
        assert body["query"] == "Enjuiciamiento"
        assert body["total"] > 0
        assert len(body["items"]) > 0

    def test_no_results(self, client: TestClient, mock_registry: LawRegistry, path: str) -> None:
        del mock_registry
        response = client.get(path, params={"q": "xyznonexistent"})
        assert response.status_code == 200
        assert response.json()["total"] == 0


class TestDeprecationContract:
    def test_canonical_has_no_deprecation_header(self, client: TestClient, mock_registry: LawRegistry) -> None:
        del mock_registry
        response = client.get(_CANONICAL, params={"q": "Enjuiciamiento"})
        assert "deprecation" not in {k.lower() for k in response.headers}

    def test_deprecated_alias_sets_headers(self, client: TestClient, mock_registry: LawRegistry) -> None:
        del mock_registry
        response = client.get(_DEPRECATED, params={"q": "Enjuiciamiento"})
        assert response.headers.get("Deprecation") == "true"
        assert "successor-version" in response.headers.get("Link", "")

    def test_canonical_not_shadowed_by_law_detail(self, client: TestClient, mock_registry: LawRegistry) -> None:
        """`/laws/search` must hit the search route, not `/laws/{law_id}`
        with law_id='search' (which would 404)."""
        del mock_registry
        response = client.get(_CANONICAL, params={"q": "Enjuiciamiento"})
        assert response.status_code == 200
        assert "items" in response.json()
