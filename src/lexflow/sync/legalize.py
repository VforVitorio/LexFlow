"""legalize-es submodule sync (issue #86).

The corpus lives at ``data/legalize-es`` as a git submodule. The frontend
Settings → Data tab needs to:

* know when the corpus was last synced and how far behind upstream it is;
* trigger a fresh ``git pull`` in the background.

This module wraps both operations. The git CLI is invoked through a thin
:class:`_Git` helper so tests can monkeypatch the subprocess boundary
without spinning up a real submodule.

--- WHERE TO CHANGE IF X CHANGES ---
* Submodule path env var      → ``LEXFLOW_DATA_PATH`` (single source of
                                truth via :mod:`lexflow.utils.config`).
* Graph invalidation hook     → wire it through the ``on_complete``
                                callback in :func:`run_sync`.
* Add a /tasks endpoint       → extend ``_SyncState`` with per-task ids
                                instead of one global flag.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

# One-at-a-time sync. ``run_sync`` early-returns when a sync is already
# in progress; the front-end polls ``/status`` to find out when it's done.
_state_lock = threading.Lock()


@dataclass
class _SyncState:
    """Module-wide sync flag. Reset to ``running=False`` on each completion."""

    running: bool = False


_state = _SyncState()


# ---------------------------------------------------------------------------
# Schema returned by the API. Snake-case on the wire; the React client's
# transformer flips it to camelCase.
# ---------------------------------------------------------------------------


class SyncStatusPayload(BaseModel):
    """Response of ``GET /api/v1/sync/status``."""

    model_config = ConfigDict(populate_by_name=True)

    last_sync_at: datetime | None = Field(
        None, description="ISO datetime of the most recent commit checked out locally."
    )
    upstream: str = Field("", description='Tracking branch, e.g. ``"origin/main"``. Empty if unset.')
    behind: int = Field(0, description="Number of upstream commits not yet merged locally.")
    busy: bool = Field(False, description="True while a ``git pull`` is in progress.")


# ---------------------------------------------------------------------------
# Git boundary — kept tiny so tests can monkeypatch the whole module.
# ---------------------------------------------------------------------------


class _Git:
    """Thin wrapper over ``git -C <path>`` invocations.

    Every call swallows ``CalledProcessError`` and returns a default
    instead — the sync endpoint must never 5xx because the submodule
    isn't fully wired (e.g. fresh clone without ``git submodule update``).
    """

    def __init__(self, repo_path: Path) -> None:
        self._path = repo_path

    def _run(self, *args: str) -> str | None:
        if not shutil.which("git"):
            logger.warning("git binary not on PATH; sync calls will degrade to placeholders")
            return None
        if not self._path.exists():
            return None
        try:
            result = subprocess.run(
                ["git", "-C", str(self._path), *args],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            logger.info("git %s failed: %s", " ".join(args), exc)
            return None
        return result.stdout.strip()

    def head_iso_date(self) -> datetime | None:
        """ISO 8601 author date of the HEAD commit, or ``None`` if unknown."""
        raw = self._run("log", "-1", "--format=%aI")
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            return None

    def upstream_branch(self) -> str:
        """Tracking branch (``origin/main``) or empty string if unset."""
        raw = self._run("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
        return raw or ""

    def behind_count(self) -> int:
        """Commits in upstream not yet in HEAD.

        Requires a recent ``git fetch`` — without one, the count is stale
        but never negative; the SPA will simply show ``0 behind`` until
        the user triggers a sync.
        """
        raw = self._run("rev-list", "--count", "HEAD..@{u}")
        if not raw or not raw.isdigit():
            return 0
        return int(raw)

    def pull(self) -> bool:
        """Run ``git pull --ff-only``. Returns ``True`` on a clean pull."""
        return self._run("pull", "--ff-only") is not None


# Module-level Git factory so tests can swap it out wholesale.
_git_factory: Callable[[Path], _Git] = _Git


def _resolve_path() -> Path:
    """Resolve the submodule path.

    Single source of truth: :func:`lexflow.utils.config.get_settings`
    reads ``LEXFLOW_DATA_PATH`` once and caches the result. The whole
    backend (registry, graph cache, sync) now agrees on one knob
    instead of three parallel env-var resolutions.
    """
    return get_settings().data_path


def is_sync_running() -> bool:
    """Whether a ``git pull`` is currently in flight."""
    with _state_lock:
        return _state.running


def get_sync_status() -> SyncStatusPayload:
    """Snapshot of the current sync state."""
    git = _git_factory(_resolve_path())
    return SyncStatusPayload(
        last_sync_at=git.head_iso_date(),
        upstream=git.upstream_branch(),
        behind=git.behind_count(),
        busy=is_sync_running(),
    )


async def run_sync(*, on_complete: Callable[[], None] | None = None) -> bool:
    """Run ``git pull`` in a thread, gated by the module-level lock.

    Returns ``True`` if this call performed the pull, ``False`` if a
    sync was already in flight (in which case the caller can poll
    ``/status`` for progress).

    ``on_complete`` is invoked after the pull finishes regardless of
    success — that's where the graph cache invalidator gets hooked in
    by the router.
    """
    with _state_lock:
        if _state.running:
            return False
        _state.running = True

    git = _git_factory(_resolve_path())
    try:
        # Punt the blocking git call off the event loop so the SSE / chat
        # streams keep responding while the pull runs.
        success = await asyncio.to_thread(git.pull)
        if not success:
            logger.info("git pull returned no output; submodule may be unconfigured")
    finally:
        with _state_lock:
            _state.running = False
        if on_complete is not None:
            try:
                on_complete()
            except Exception:
                logger.exception("sync on_complete hook raised")
    return True
