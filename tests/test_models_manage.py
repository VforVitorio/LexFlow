"""Tests for the Ollama model-management endpoints (#597).

Patches ``ollama.AsyncClient`` methods so the suite never needs a real
daemon — covers installed listing (size + loaded projection), delete
(success / 404 / bad-name), and load/eject (keep_alive wiring).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import ollama
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.api.routers import models as models_router


@dataclass
class _Model:
    model: str
    size: int | None = None


@dataclass
class _Listing:
    models: list[_Model] = field(default_factory=list)


def _install_listing(monkeypatch: MonkeyPatch, listing: _Listing, running: _Listing) -> None:
    async def fake_list(self: Any) -> _Listing:
        return listing

    async def fake_ps(self: Any) -> _Listing:
        return running

    monkeypatch.setattr(models_router.ollama.AsyncClient, "list", fake_list)
    monkeypatch.setattr(models_router.ollama.AsyncClient, "ps", fake_ps)


class TestInstalledModels:
    def test_projects_size_and_loaded_state(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        listing = _Listing(models=[_Model("qwen2.5:7b", 4_700_000_000), _Model("llama3.2:3b", 2_000_000_000)])
        running = _Listing(models=[_Model("qwen2.5:7b")])
        _install_listing(monkeypatch, listing, running)

        response = client.get("/api/v1/models/installed")
        assert response.status_code == 200
        models = response.json()["models"]
        # Sorted by name → llama3.2 comes first.
        assert [m["name"] for m in models] == ["llama3.2:3b", "qwen2.5:7b"]
        qwen = next(m for m in models if m["name"] == "qwen2.5:7b")
        assert qwen["loaded"] is True
        assert qwen["size_bytes"] == 4_700_000_000
        assert next(m for m in models if m["name"] == "llama3.2:3b")["loaded"] is False

    def test_ollama_down_returns_empty_not_error(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        async def boom(self: Any) -> Any:
            raise ConnectionError("daemon down")

        monkeypatch.setattr(models_router.ollama.AsyncClient, "list", boom)
        response = client.get("/api/v1/models/installed")
        assert response.status_code == 200
        assert response.json() == {"models": []}


class TestDeleteModel:
    def test_deletes_installed_model(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        captured: dict[str, str] = {}

        async def fake_delete(self: Any, model: str) -> None:
            captured["model"] = model

        monkeypatch.setattr(models_router.ollama.AsyncClient, "delete", fake_delete)
        response = client.post("/api/v1/models/delete", json={"model": "qwen2.5:7b"})
        assert response.status_code == 200
        assert response.json() == {"status": "deleted", "model": "qwen2.5:7b"}
        assert captured["model"] == "qwen2.5:7b"

    def test_missing_model_is_404(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        async def fake_delete(self: Any, model: str) -> None:
            raise ollama.ResponseError("not found", 404)

        monkeypatch.setattr(models_router.ollama.AsyncClient, "delete", fake_delete)
        response = client.post("/api/v1/models/delete", json={"model": "ghost:1b"})
        assert response.status_code == 404
        # `detail` is a plain string per the /api/v1 contract (CodeRabbit #629).
        assert "not installed" in response.json()["detail"]

    def test_rejects_malformed_name(self, client: TestClient) -> None:
        response = client.post("/api/v1/models/delete", json={"model": "bad name!!"})
        assert response.status_code == 422


class TestLoadEject:
    def test_load_warms_with_keep_alive(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        captured: dict[str, Any] = {}

        async def fake_generate(self: Any, model: str, prompt: str = "", keep_alive: Any = None, **_: Any) -> None:
            captured.update(model=model, keep_alive=keep_alive)

        monkeypatch.setattr(models_router.ollama.AsyncClient, "generate", fake_generate)
        response = client.post("/api/v1/models/load", json={"model": "qwen2.5:7b", "keep": True})
        assert response.status_code == 200
        assert response.json()["status"] == "loaded"
        assert captured["keep_alive"] == models_router._KEEP_ALIVE_WARM

    def test_eject_unloads_with_zero_keep_alive(self, client: TestClient, monkeypatch: MonkeyPatch) -> None:
        captured: dict[str, Any] = {}

        async def fake_generate(self: Any, model: str, prompt: str = "", keep_alive: Any = None, **_: Any) -> None:
            captured.update(keep_alive=keep_alive)

        monkeypatch.setattr(models_router.ollama.AsyncClient, "generate", fake_generate)
        response = client.post("/api/v1/models/load", json={"model": "qwen2.5:7b", "keep": False})
        assert response.status_code == 200
        assert response.json()["status"] == "ejected"
        assert captured["keep_alive"] == models_router._KEEP_ALIVE_EJECT
