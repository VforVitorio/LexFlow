"""Corpus delta detection for incremental cache updates (#230).

When the legalize-es submodule advances, most launches/syncs touch only a
handful of laws. Re-parsing all ~12 K is wasteful. This module asks git which
law files changed between two commits and returns the affected law IDs so the
registry, search index and graph can be patched in place instead of rebuilt.

The single public entry point is :func:`diff_corpus_since`. It returns ``None``
(never raises) whenever the diff can't be trusted — git failure, or a change so
large that a full rebuild is cheaper — so callers fall back to a wholesale
rebuild.
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

from lexflow.utils.file_discovery import is_law_file_name

logger = logging.getLogger(__name__)

# Above this many changed law files, a full rebuild is simpler and not much
# slower than thousands of individual patches — bail to the rebuild path.
REBUILD_THRESHOLD = 2000


@dataclass(frozen=True)
class CorpusDiff:
    """Law IDs that changed between two corpus revisions.

    A rename is modelled as a removal of the old ID plus an addition of the
    new one — same as a modify for the registry's purposes.
    """

    added: list[str]
    modified: list[str]
    removed: list[str]

    @property
    def total(self) -> int:
        """Total number of affected law IDs."""
        return len(self.added) + len(self.modified) + len(self.removed)

    @property
    def is_empty(self) -> bool:
        """Whether nothing changed."""
        return self.total == 0


def diff_corpus_since(data_path: Path, cached_commit: str) -> CorpusDiff | None:
    """Return the law-level diff between *cached_commit* and current HEAD.

    Returns ``None`` when the diff is untrustworthy (git error, unknown
    revision) or too large (> :data:`REBUILD_THRESHOLD` files) — the caller
    should fall back to a full rebuild. An empty :class:`CorpusDiff` (no
    changes) is distinct from ``None`` and means "caches are already current".
    """
    if not cached_commit or cached_commit == "unknown":
        return None
    raw = _run_name_status_diff(data_path, cached_commit)
    if raw is None:
        return None

    added: list[str] = []
    modified: list[str] = []
    removed: list[str] = []
    for line in raw.splitlines():
        _classify_diff_line(line, added=added, modified=modified, removed=removed)

    diff = CorpusDiff(added=added, modified=modified, removed=removed)
    if diff.total > REBUILD_THRESHOLD:
        logger.info("Corpus diff too large (%d files) — full rebuild preferred", diff.total)
        return None
    return diff


def _run_name_status_diff(data_path: Path, cached_commit: str) -> str | None:
    """Run ``git diff --name-status`` for law files, or ``None`` on failure.

    ``-M`` enables rename detection so a moved law is reported as ``R`` with
    both paths instead of an unrelated add+delete pair.
    """
    try:
        result = subprocess.check_output(
            ["git", "-C", str(data_path), "diff", "--name-status", "-M", f"{cached_commit}..HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return result
    # Non-zero exit (unknown commit, shallow clone missing the base) or a
    # missing git binary — degrade to the rebuild path rather than crash sync.
    except (subprocess.CalledProcessError, OSError) as exc:
        logger.warning("Corpus diff failed, will rebuild: %s", exc)
        return None


def _classify_diff_line(
    line: str,
    *,
    added: list[str],
    modified: list[str],
    removed: list[str],
) -> None:
    """Sort one ``--name-status`` line into the right bucket by law ID.

    Non-law paths (READMEs, assets) are ignored. A rename (``R``) becomes a
    removal of the old law ID plus an addition of the new one.
    """
    parts = line.split("\t")
    if len(parts) < 2:
        return
    status = parts[0]
    code = status[0]

    if code == "R" and len(parts) >= 3:
        old_path, new_path = Path(parts[1]), Path(parts[2])
        if is_law_file_name(old_path):
            removed.append(old_path.stem)
        if is_law_file_name(new_path):
            added.append(new_path.stem)
        return

    path = Path(parts[1])
    if not is_law_file_name(path):
        return
    if code == "A":
        added.append(path.stem)
    elif code == "M":
        modified.append(path.stem)
    elif code == "D":
        removed.append(path.stem)
