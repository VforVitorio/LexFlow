"""Tests for corpus delta detection (#230) against a real temp git repo."""

from __future__ import annotations

import subprocess
from pathlib import Path

from lexflow.core.delta_sync import REBUILD_THRESHOLD, CorpusDiff, diff_corpus_since


def _git(repo: Path, *args: str) -> str:
    """Run a git command in *repo*, returning stdout."""
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _init_repo(repo: Path) -> None:
    _git(repo, "init")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test")
    _git(repo, "config", "commit.gpgsign", "false")


def _write_law(repo: Path, law_id: str, body: str = "x") -> None:
    path = repo / "es" / f"{law_id}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {law_id}\n{body}\n", encoding="utf-8")


def _commit(repo: Path, message: str) -> str:
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", message)
    return _git(repo, "rev-parse", "HEAD")


def test_added_modified_removed(tmp_path: Path) -> None:
    repo = tmp_path
    _init_repo(repo)
    _write_law(repo, "BOE-A-2000-1", "original")
    _write_law(repo, "BOE-A-2000-9", "to be deleted")
    base = _commit(repo, "base")

    _write_law(repo, "BOE-A-2000-2")  # added
    _write_law(repo, "BOE-A-2000-1", "edited")  # modified
    (repo / "es" / "BOE-A-2000-9.md").unlink()  # removed
    _commit(repo, "change")

    diff = diff_corpus_since(repo, base)
    assert diff is not None
    assert diff.added == ["BOE-A-2000-2"]
    assert diff.modified == ["BOE-A-2000-1"]
    assert diff.removed == ["BOE-A-2000-9"]
    assert diff.total == 3
    assert not diff.is_empty


def test_rename_is_remove_plus_add(tmp_path: Path) -> None:
    repo = tmp_path
    _init_repo(repo)
    _write_law(repo, "BOE-A-2000-1", "stable content for rename detection")
    base = _commit(repo, "base")

    (repo / "es" / "BOE-A-2000-1.md").rename(repo / "es" / "BOE-A-2099-1.md")
    _commit(repo, "rename")

    diff = diff_corpus_since(repo, base)
    assert diff is not None
    assert "BOE-A-2000-1" in diff.removed
    assert "BOE-A-2099-1" in diff.added


def test_non_law_files_ignored(tmp_path: Path) -> None:
    repo = tmp_path
    _init_repo(repo)
    _write_law(repo, "BOE-A-2000-1")
    base = _commit(repo, "base")

    (repo / "README.md").write_text("# readme\n", encoding="utf-8")
    (repo / "es" / "notes.txt").write_text("notes\n", encoding="utf-8")
    _commit(repo, "noise")

    diff = diff_corpus_since(repo, base)
    assert diff is not None
    assert diff.is_empty


def test_unknown_commit_returns_none(tmp_path: Path) -> None:
    repo = tmp_path
    _init_repo(repo)
    _write_law(repo, "BOE-A-2000-1")
    _commit(repo, "base")
    assert diff_corpus_since(repo, "unknown") is None
    assert diff_corpus_since(repo, "") is None


def test_bad_base_commit_returns_none(tmp_path: Path) -> None:
    repo = tmp_path
    _init_repo(repo)
    _write_law(repo, "BOE-A-2000-1")
    _commit(repo, "base")
    # A sha that doesn't exist -> git diff errors -> None (rebuild path).
    assert diff_corpus_since(repo, "deadbeef" * 5) is None


def test_no_changes_is_empty_not_none(tmp_path: Path) -> None:
    repo = tmp_path
    _init_repo(repo)
    _write_law(repo, "BOE-A-2000-1")
    base = _commit(repo, "base")
    diff = diff_corpus_since(repo, base)
    assert diff == CorpusDiff(added=[], modified=[], removed=[])


def test_threshold_constant_is_sane() -> None:
    # A safety net so an accidental edit to 0 doesn't silently disable
    # incremental sync entirely.
    assert REBUILD_THRESHOLD > 100
