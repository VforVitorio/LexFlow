"""Tests for GET /api/v1/laws/{law_id}/references (#96)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from lexflow.core.registry import LawRegistry


class TestLawReferences:
    def test_returns_object_with_references_and_total(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        response = client.get("/api/v1/laws/BOE-A-2000-323/references")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body["references"], list)
        assert isinstance(body["total"], int)
        assert body["total"] == len(body["references"])

    def test_default_filters_unresolved(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        # Default ``include_unresolved=False`` must drop refs without target_id.
        body = client.get("/api/v1/laws/BOE-A-2000-323/references").json()
        for ref in body["references"]:
            assert ref["target_id"] is not None

    def test_include_unresolved_returns_more_or_equal(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        filtered = client.get("/api/v1/laws/BOE-A-2000-323/references").json()
        full = client.get(
            "/api/v1/laws/BOE-A-2000-323/references",
            params={"include_unresolved": "true"},
        ).json()
        # The full set is a superset of the filtered set — it can be equal
        # (when every reference resolves) but never smaller.
        assert full["total"] >= filtered["total"]

    def test_each_reference_carries_expected_fields(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        body = client.get(
            "/api/v1/laws/BOE-A-2000-323/references",
            params={"include_unresolved": "true"},
        ).json()
        for ref in body["references"]:
            # Domain model is ``Reference(target_id, target_text, source_article)``.
            assert "target_text" in ref
            assert "target_id" in ref
            assert "source_article" in ref

    def test_payload_smaller_than_law_detail(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        """Whole point of the endpoint: skip transferring article bodies."""
        full = client.get("/api/v1/laws/BOE-A-2000-323")
        refs = client.get("/api/v1/laws/BOE-A-2000-323/references")
        assert len(refs.content) < len(full.content)

    def test_not_found(self, client: TestClient, mock_registry: LawRegistry) -> None:
        response = client.get("/api/v1/laws/NONEXISTENT-123/references")
        assert response.status_code == 404
        body = response.json()
        assert body["code"] == "law_not_found"
