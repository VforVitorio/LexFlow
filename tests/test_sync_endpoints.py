"""Tests for the corpus sync endpoint (incremental + fallback, #230)."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.core.delta_sync import CorpusDiff


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _pull_result(stdout: str) -> object:
    return type("R", (), {"stdout": stdout, "stderr": ""})()


@patch("lexflow.api.routers.sync.subprocess.run")
@patch("lexflow.api.routers.sync.submodule_hash")
def test_sync_noop_when_revision_unchanged(mock_hash: MagicMock, mock_run: MagicMock, client: TestClient) -> None:
    """No revision change -> mode 'noop', git pull still attempted."""
    mock_hash.return_value = "samehash"
    mock_run.return_value = _pull_result("Already up to date.")
    with patch("lexflow.api.routers.sync.get_registry"):
        response = client.post("/api/v1/sync")
    assert response.status_code == 200
    assert response.json()["mode"] == "noop"
    mock_run.assert_called_once()


@patch("lexflow.api.routers.sync.save_graph")
@patch("lexflow.api.routers.sync.save_search_index")
@patch("lexflow.api.routers.sync.save_metadata_cache")
@patch("lexflow.api.routers.sync.apply_diff_to_graph")
@patch("lexflow.api.routers.sync.get_graph")
@patch("lexflow.api.routers.sync.diff_corpus_since")
@patch("lexflow.api.routers.sync.subprocess.run")
@patch("lexflow.api.routers.sync.submodule_hash")
def test_sync_incremental_applies_diff(
    mock_hash: MagicMock,
    mock_run: MagicMock,
    mock_diff: MagicMock,
    mock_get_graph: MagicMock,
    mock_apply_graph: MagicMock,
    mock_save_meta: MagicMock,
    mock_save_search: MagicMock,
    mock_save_graph: MagicMock,
    client: TestClient,
) -> None:
    """A small diff is applied incrementally and the caches are rewritten."""
    mock_hash.side_effect = ["before", "after"]
    mock_run.return_value = _pull_result("Updating before..after")
    mock_diff.return_value = CorpusDiff(added=["BOE-A-2026-1"], modified=["BOE-A-2026-2"], removed=[])

    registry = MagicMock()
    registry.export_search_index.return_value.is_built = True
    with patch("lexflow.api.routers.sync.get_registry", return_value=registry):
        response = client.post("/api/v1/sync")

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "incremental"
    assert body["added"] == 1
    assert body["modified"] == 1
    assert body["removed"] == 0
    registry.apply_corpus_diff.assert_called_once()
    mock_apply_graph.assert_called_once()
    mock_save_meta.assert_called_once()
    mock_save_search.assert_called_once()
    mock_save_graph.assert_called_once()


@patch("lexflow.api.routers.sync.reset_graph_cache")
@patch("lexflow.api.routers.sync.diff_corpus_since")
@patch("lexflow.api.routers.sync.subprocess.run")
@patch("lexflow.api.routers.sync.submodule_hash")
def test_sync_falls_back_to_rebuild(
    mock_hash: MagicMock,
    mock_run: MagicMock,
    mock_diff: MagicMock,
    mock_reset: MagicMock,
    client: TestClient,
) -> None:
    """An untrustworthy diff (None) drops caches for a full rebuild."""
    mock_hash.side_effect = ["before", "after"]
    mock_run.return_value = _pull_result("Updating before..after")
    mock_diff.return_value = None

    registry = MagicMock()
    with patch("lexflow.api.routers.sync.get_registry", return_value=registry) as mock_get_registry:
        response = client.post("/api/v1/sync")

    assert response.status_code == 200
    assert response.json()["mode"] == "rebuild"
    mock_reset.assert_called_once()
    mock_get_registry.cache_clear.assert_called_once()


@patch("lexflow.api.routers.sync.subprocess.run")
def test_sync_handles_git_failure(mock_run: MagicMock, client: TestClient) -> None:
    """A git pull failure surfaces as HTTP 500."""
    mock_run.side_effect = subprocess.CalledProcessError(1, "git", stderr="fatal: not a repo")
    with patch("lexflow.api.routers.sync.submodule_hash", return_value="x"):
        response = client.post("/api/v1/sync")
    assert response.status_code == 500
    assert "git pull failed" in response.json()["detail"]


@patch("lexflow.api.routers.sync.subprocess.run")
def test_sync_timeout(mock_run: MagicMock, client: TestClient) -> None:
    """A git pull timeout surfaces as HTTP 504."""
    mock_run.side_effect = subprocess.TimeoutExpired("git", 120)
    with patch("lexflow.api.routers.sync.submodule_hash", return_value="x"):
        response = client.post("/api/v1/sync")
    assert response.status_code == 504
