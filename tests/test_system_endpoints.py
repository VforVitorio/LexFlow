"""Tests for the system introspection endpoints (#222)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from lexflow.api.warmup import get_warmup_state, reset_warmup_state


@pytest.fixture(autouse=True)
def _isolated_warmup_state() -> object:
    """Reset the warm-up state before AND after each test.

    The state is a module-level singleton; without this fixture the
    first test that touches it would leak its values into the rest of
    the suite.
    """
    reset_warmup_state()
    yield
    reset_warmup_state()


class TestSystemWarmupEndpoint:
    def test_default_state_is_not_ready(self, client: TestClient) -> None:
        """No warm-up has run → all flags false, response is well-formed."""
        response = client.get("/api/v1/system/warmup")
        assert response.status_code == 200
        body = response.json()
        assert body == {
            "ready": False,
            "metadata_ready": False,
            "search_ready": False,
            "graph_ready": False,
            "error": None,
            "durations_seconds": {},
        }

    def test_endpoint_reflects_mutated_state(self, client: TestClient) -> None:
        """Mutating the singleton flips the response — proves the endpoint
        reads through to the live state rather than caching."""
        state = get_warmup_state()
        state.metadata_ready = True
        state.search_ready = True
        state.graph_ready = True
        state.durations_seconds["metadata"] = 4.2

        body = client.get("/api/v1/system/warmup").json()
        assert body["ready"] is True
        assert body["metadata_ready"] is True
        assert body["durations_seconds"] == {"metadata": 4.2}

    def test_error_message_propagated(self, client: TestClient) -> None:
        state = get_warmup_state()
        state.error = "data path missing"
        body = client.get("/api/v1/system/warmup").json()
        assert body["error"] == "data path missing"
        assert body["ready"] is False


class TestWarmupStateInvariants:
    def test_reset_clears_every_flag(self) -> None:
        state = get_warmup_state()
        state.metadata_ready = True
        state.search_ready = True
        state.graph_ready = True
        state.error = "boom"
        state.durations_seconds["metadata"] = 1.0

        reset_warmup_state()
        fresh = get_warmup_state()
        assert fresh.metadata_ready is False
        assert fresh.search_ready is False
        assert fresh.graph_ready is False
        assert fresh.error is None
        assert fresh.durations_seconds == {}
        assert fresh.ready is False

    def test_ready_flag_requires_all_stages(self) -> None:
        state = get_warmup_state()
        state.metadata_ready = True
        state.search_ready = True
        assert state.ready is False, "graph still pending"
        state.graph_ready = True
        assert state.ready is True
