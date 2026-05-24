"""Tests for ``GET /api/v1/dashboards/{preset}`` (issue #85).

Uses the existing ``mock_registry`` fixture (small two-law sample) so we
exercise the real ``LawRegistry`` → ``DashboardPayload`` pipeline without
needing the legalize-es submodule.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from lexflow.core.registry import LawRegistry


@pytest.mark.usefixtures("mock_registry")
class TestDashboardsEndpoint:
    def test_compliance_preset_returns_payload_shape(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        del mock_registry  # only here for the fixture-wiring side effect
        response = client.get("/api/v1/dashboards/compliance")
        assert response.status_code == 200
        body = response.json()
        assert body["preset"] == "compliance"
        assert isinstance(body["cards"], list)
        assert len(body["cards"]) >= 1
        for card in body["cards"]:
            assert {"id", "title", "value", "delta", "spark"}.issubset(card.keys())
            assert isinstance(card["spark"], list)
        assert "labels" in body["series"]
        assert "values" in body["series"]
        assert len(body["series"]["labels"]) == len(body["series"]["values"])

    def test_analytics_preset_returns_volume_cards(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        del mock_registry
        body = client.get("/api/v1/dashboards/analytics").json()
        assert body["preset"] == "analytics"
        card_ids = {c["id"] for c in body["cards"]}
        assert {"total", "ritmo", "top_rango"}.issubset(card_ids)

    def test_compliance_card_ids_match_status_buckets(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        del mock_registry
        body = client.get("/api/v1/dashboards/compliance").json()
        ids = {c["id"] for c in body["cards"]}
        assert ids == {"vigentes", "modificadas", "derogadas"}

    def test_unknown_preset_returns_422_from_path_regex(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        """The path regex rejects unknown presets before the handler runs.

        FastAPI surfaces this as 422 (validation) rather than 404 — that's
        fine for the SPA because the live tabs only target valid presets.
        """
        del mock_registry
        response = client.get("/api/v1/dashboards/nope")
        assert response.status_code == 422

    def test_series_recent_from_within_bounds(
        self,
        client: TestClient,
        mock_registry: LawRegistry,
    ) -> None:
        del mock_registry
        body = client.get("/api/v1/dashboards/analytics").json()
        series = body["series"]
        if series["values"]:
            recent_from = series["recent_from"]
            assert recent_from is not None
            assert 0 <= recent_from <= len(series["values"])
