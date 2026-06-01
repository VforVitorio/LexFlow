"""Tests for the versions router (issue #103).

The router depends on :class:`GitHistoryReader`, which shells out to
``git -C <data_path> log`` and ``git diff`` against the legalize-es
submodule. Spinning up a real temporary git repo per test is feasible
but slow and platform-touchy on Windows. Instead we override the
``_get_git_reader`` provider with a fake that returns canned data —
the router's job is to wire the dependency, not to test git itself
(:mod:`lexflow.core.git_history` has its own unit tests).
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.routers.versions import _get_git_reader
from lexflow.core.models import DiffStats, LawDiff, LawVersion


class _FakeGitReader:
    """Stand-in for :class:`GitHistoryReader`.

    Exposes the same method names the router uses; both return canned
    payloads so the router code path runs end-to-end.
    """

    def __init__(self) -> None:
        self.log_calls: list[tuple[Path, int]] = []
        self.diff_calls: list[tuple[Path, str, str]] = []

    def get_file_log(self, file_path: Path, max_count: int = 50) -> list[LawVersion]:
        self.log_calls.append((file_path, max_count))
        return [
            LawVersion(
                commit_hash="abc123def",
                date=date(2026, 1, 15),
                message="Update articles 1-3",
                norma="Ley 5/2026",
                disposicion=None,
                articulos_afectados=["1", "2", "3"],
            ),
            LawVersion(
                commit_hash="0000000",
                date=date(2025, 12, 1),
                message="Initial import",
                norma=None,
                disposicion=None,
                articulos_afectados=[],
            ),
        ]

    def get_diff(self, file_path: Path, from_commit: str, to_commit: str) -> LawDiff:
        self.diff_calls.append((file_path, from_commit, to_commit))
        return LawDiff(
            law_id="BOE-A-2000-323",
            from_commit=from_commit,
            to_commit=to_commit,
            from_date=date(2025, 12, 1),
            to_date=date(2026, 1, 15),
            diff_text="@@ -1,1 +1,2 @@\n example\n+nuevo párrafo",
            stats=DiffStats(additions=1, deletions=0, changed_articles=["1"]),
        )


@pytest.fixture()
def fake_git_reader() -> Iterator[_FakeGitReader]:
    """Override the versions router's git reader with the fake."""
    fake = _FakeGitReader()
    app.dependency_overrides[_get_git_reader] = lambda: fake
    yield fake
    app.dependency_overrides.pop(_get_git_reader, None)


class TestListVersions:
    def test_returns_canned_history(
        self,
        client: TestClient,
        mock_registry: object,
        fake_git_reader: _FakeGitReader,
    ) -> None:
        del mock_registry, fake_git_reader
        response = client.get("/api/v1/laws/BOE-A-2000-323/versions")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["commit_hash"] == "abc123def"
        assert body[0]["articulos_afectados"] == ["1", "2", "3"]
        assert body[1]["commit_hash"] == "0000000"

    def test_404_for_unknown_law(
        self, client: TestClient, mock_registry: object, fake_git_reader: _FakeGitReader
    ) -> None:
        del mock_registry, fake_git_reader
        response = client.get("/api/v1/laws/MISSING/versions")
        assert response.status_code == 404

    def test_forwards_max_count_to_reader(
        self, client: TestClient, mock_registry: object, fake_git_reader: _FakeGitReader
    ) -> None:
        del mock_registry
        client.get("/api/v1/laws/BOE-A-2000-323/versions", params={"max_count": 7})
        assert fake_git_reader.log_calls[-1][1] == 7

    def test_rejects_invalid_max_count(
        self, client: TestClient, mock_registry: object, fake_git_reader: _FakeGitReader
    ) -> None:
        del mock_registry, fake_git_reader
        response = client.get("/api/v1/laws/BOE-A-2000-323/versions", params={"max_count": 9999})
        assert response.status_code == 422


class TestGetDiff:
    def test_returns_canned_diff(
        self,
        client: TestClient,
        mock_registry: object,
        fake_git_reader: _FakeGitReader,
    ) -> None:
        del mock_registry, fake_git_reader
        response = client.get(
            "/api/v1/laws/BOE-A-2000-323/diff",
            params={"from": "abc123def", "to": "0000000"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["from_commit"] == "abc123def"
        assert body["to_commit"] == "0000000"
        assert body["stats"]["additions"] == 1
        assert body["stats"]["changed_articles"] == ["1"]

    def test_requires_from_and_to(
        self, client: TestClient, mock_registry: object, fake_git_reader: _FakeGitReader
    ) -> None:
        del mock_registry, fake_git_reader
        response = client.get("/api/v1/laws/BOE-A-2000-323/diff", params={"from": "abc"})
        assert response.status_code == 422

    def test_forwards_both_commits_to_reader(
        self,
        client: TestClient,
        mock_registry: object,
        fake_git_reader: _FakeGitReader,
    ) -> None:
        del mock_registry
        # #104 #7 — Query now enforces ``^[0-9a-f]{7,40}$``. Use valid
        # short hashes so the request reaches the reader.
        client.get(
            "/api/v1/laws/BOE-A-2000-323/diff",
            params={"from": "abc1234", "to": "def5678"},
        )
        _file, from_commit, to_commit = fake_git_reader.diff_calls[-1]
        assert from_commit == "abc1234"
        assert to_commit == "def5678"

    def test_rejects_non_hex_commit_hash(
        self,
        client: TestClient,
        mock_registry: object,
        fake_git_reader: _FakeGitReader,
    ) -> None:
        del mock_registry, fake_git_reader
        response = client.get(
            "/api/v1/laws/BOE-A-2000-323/diff",
            params={"from": "xxxxxxx", "to": "abc1234"},
        )
        assert response.status_code == 422

    def test_rejects_too_short_commit_hash(
        self,
        client: TestClient,
        mock_registry: object,
        fake_git_reader: _FakeGitReader,
    ) -> None:
        del mock_registry, fake_git_reader
        response = client.get(
            "/api/v1/laws/BOE-A-2000-323/diff",
            params={"from": "abc", "to": "abc1234"},
        )
        assert response.status_code == 422
