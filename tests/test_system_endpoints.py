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
            "semantic_ready": False,
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


class TestSemanticStatusEndpoint:
    """``GET /system/semantic-status`` — drives the Settings → Models card.

    ``is_sentence_transformers_available`` is monkeypatched so the result is
    deterministic regardless of whether the heavy dep happens to be present
    in the test environment (it is not installed in CI).
    """

    def test_hash_backend_reports_inactive(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        from lexflow.api.routers import system as system_mod
        from lexflow.utils.config import get_settings

        monkeypatch.setattr(system_mod, "is_sentence_transformers_available", lambda: False)
        get_settings.cache_clear()  # default backend = "hash"
        body = client.get("/api/v1/system/semantic-status").json()
        assert body["backend"] == "hash"
        assert body["installed"] is False
        assert body["active"] is False

    def test_active_when_selected_and_installed(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        from lexflow.api.routers import system as system_mod
        from lexflow.utils.config import get_settings

        monkeypatch.setenv("LEXFLOW_EMBEDDER", "sentence-transformers")
        monkeypatch.setenv("LEXFLOW_EMBEDDER_MODEL", "my-model")
        get_settings.cache_clear()
        monkeypatch.setattr(system_mod, "is_sentence_transformers_available", lambda: True)
        body = client.get("/api/v1/system/semantic-status").json()
        assert body["backend"] == "sentence-transformers"
        assert body["installed"] is True
        assert body["active"] is True
        assert body["model"] == "my-model"

    def test_selected_but_dep_missing_is_inactive(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        from lexflow.api.routers import system as system_mod
        from lexflow.utils.config import get_settings

        monkeypatch.setenv("LEXFLOW_EMBEDDER", "sentence-transformers")
        get_settings.cache_clear()
        monkeypatch.setattr(system_mod, "is_sentence_transformers_available", lambda: False)
        body = client.get("/api/v1/system/semantic-status").json()
        assert body["backend"] == "sentence-transformers"
        assert body["installed"] is False
        assert body["active"] is False


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
        assert fresh.semantic_ready is False
        assert fresh.error is None
        assert fresh.durations_seconds == {}
        assert fresh.ready is False

    def test_ready_flag_requires_all_core_stages(self) -> None:
        state = get_warmup_state()
        state.metadata_ready = True
        state.search_ready = True
        assert state.ready is False, "graph still pending"
        state.graph_ready = True
        assert state.ready is True

    def test_ready_excludes_opt_in_semantic_stage(self) -> None:
        # Semantic is opt-in (#548): its readiness must not gate `ready`.
        state = get_warmup_state()
        state.metadata_ready = state.search_ready = state.graph_ready = True
        state.semantic_ready = False
        assert state.ready is True
        state.metadata_ready = False
        state.semantic_ready = True
        assert state.ready is False


class TestWarmupSemanticStage:
    """Stage 4 pre-builds the semantic index so the first query isn't cold (#548).

    The heavy stage functions are stubbed so the test is fast and deterministic
    (no corpus parse, no embedder). What we assert is the orchestration: the
    stage runs and marks ``semantic_ready``, and a failure stays best-effort.
    """

    @staticmethod
    def _stub_core_stages(monkeypatch: pytest.MonkeyPatch) -> object:
        from pathlib import Path
        from types import SimpleNamespace

        import lexflow.api.warmup as warmup

        monkeypatch.setattr(warmup, "get_settings", lambda: SimpleNamespace(data_path=Path(".")))
        monkeypatch.setattr(warmup, "get_law_registry", lambda: object())
        monkeypatch.setattr(warmup, "load_or_preload_metadata", lambda *a, **k: None)
        monkeypatch.setattr(warmup, "load_or_build_search", lambda *a, **k: None)
        monkeypatch.setattr(warmup, "get_graph", lambda *a, **k: None)
        return warmup

    async def test_prewarms_semantic_and_marks_ready(self, monkeypatch: pytest.MonkeyPatch) -> None:
        warmup = self._stub_core_stages(monkeypatch)
        seen: dict[str, bool] = {}
        monkeypatch.setattr(warmup, "ensure_semantic_index", lambda registry: seen.setdefault("called", True))

        reset_warmup_state()
        await warmup._run_warmup()

        state = warmup.get_warmup_state()
        assert seen.get("called") is True
        assert state.semantic_ready is True
        assert state.ready is True
        assert state.error is None

    async def test_semantic_failure_is_best_effort(self, monkeypatch: pytest.MonkeyPatch) -> None:
        warmup = self._stub_core_stages(monkeypatch)

        def boom(registry: object) -> None:
            raise RuntimeError("model download failed")

        monkeypatch.setattr(warmup, "ensure_semantic_index", boom)

        reset_warmup_state()
        await warmup._run_warmup()

        state = warmup.get_warmup_state()
        assert state.semantic_ready is False
        assert state.ready is True  # core stages unaffected
        assert state.error is None  # opt-in failure is logged, not surfaced as a global error
