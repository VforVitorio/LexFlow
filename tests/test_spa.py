"""Tests for the production SPA mount (#552).

The P0 bug was an off-by-one in the project-root depth: `parents[4]` pointed
one level *above* the repo, so `frontend/dist` was never found and the
single-process prod server silently served no SPA. The first test pins the
depth so it can't drift again; the rest exercise mount/skip behaviour.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import lexflow.api.spa as spa


def test_project_root_resolves_to_repo_root() -> None:
    # tests/ sits at the repo root, so its parent IS the repo root.
    repo_root = Path(__file__).resolve().parents[1]
    assert repo_root == spa._PROJECT_ROOT
    assert repo_root / "frontend" / "dist" == spa.SPA_DIR


def _build_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "frontend" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>LexFlow</title>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('app')", encoding="utf-8")
    return dist


def test_mount_spa_serves_index_for_spa_route(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(spa, "SPA_DIR", _build_dist(tmp_path))
    app = FastAPI()
    spa.mount_spa(app)
    client = TestClient(app)

    resp = client.get("/laws/BOE-A-1978-31229")  # an SPA route, no matching file
    assert resp.status_code == 200
    assert "LexFlow" in resp.text


def test_mount_spa_serves_existing_asset(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(spa, "SPA_DIR", _build_dist(tmp_path))
    app = FastAPI()
    spa.mount_spa(app)
    client = TestClient(app)

    resp = client.get("/assets/app.js")
    assert resp.status_code == 200
    assert "console.log" in resp.text


def test_mount_spa_skips_when_dist_absent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(spa, "SPA_DIR", tmp_path / "does-not-exist")
    app = FastAPI()
    spa.mount_spa(app)
    # No catch-all registered → unknown route is a plain 404, not index.html.
    resp = TestClient(app).get("/anything")
    assert resp.status_code == 404
