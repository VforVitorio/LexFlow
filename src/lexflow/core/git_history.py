"""Git history operations for law version tracking.

Reads git log and diff data from the legalize-es repository to expose
legislative reform history.
"""

from __future__ import annotations

import logging
import re
import subprocess
from collections import OrderedDict
from datetime import date
from pathlib import Path

from lexflow.core.models import DiffStats, LawDiff, LawVersion

logger = logging.getLogger(__name__)

_RECORD_SEP = "---LEXFLOW-SEP---"
_LOG_FORMAT = f"%H%n%aI%n%s%n%b{_RECORD_SEP}"

# #553 — `git log --follow` over the 1.7 GB legalize-es submodule costs
# ~9 s per call, and the "Versiones" tab paid it on every visit. Cache
# the parsed result keyed by (path, max_count, corpus HEAD sha). The HEAD
# sha is a ~ms `git rev-parse`, and embedding it means a corpus sync (new
# commit) transparently invalidates stale entries — old-head keys simply
# age out of the LRU. Module-level because the reader is re-instantiated
# per request (FastAPI dependency), so an instance cache wouldn't persist.
_FILE_LOG_CACHE: OrderedDict[tuple[str, int, str], list[LawVersion]] = OrderedDict()
_FILE_LOG_CACHE_MAXSIZE = 4096

# Hot path: per-line scan of every diff. Hoisting to module scope
# avoids re-compiling the pattern on every method invocation (audit
# #409 perf finding).
_ARTICLE_HEADING_RE = re.compile(r"Art[ií]culo\s+(\S+?)\.?\s*$", re.IGNORECASE)


class GitHistoryReader:
    """Reads git history for individual law files from the legalize-es repository."""

    def __init__(self, repo_path: Path) -> None:
        self._repo_path = repo_path

    # ------------------------------------------------------------------
    # Git command runner
    # ------------------------------------------------------------------

    def _run_git(self, *args: str) -> str:
        """Execute a git command in the data repo directory.  Returns stdout."""
        cmd = ["git", *args]
        try:
            result = subprocess.run(
                cmd,
                cwd=self._repo_path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=30,
            )
        except FileNotFoundError:
            logger.error("git executable not found")
            return ""
        except subprocess.TimeoutExpired:
            logger.error("git command timed out: %s", cmd)
            return ""

        if result.returncode != 0:
            logger.warning("git command failed: %s\nstderr: %s", cmd, result.stderr.strip())
            return ""

        return result.stdout

    # ------------------------------------------------------------------
    # File log
    # ------------------------------------------------------------------

    def head_revision(self) -> str:
        """Current HEAD sha of the data repo — the corpus version key.

        Cheap (``git rev-parse HEAD``, ~ms) compared to the multi-second
        ``git log --follow``. Used as the file-log cache key so a corpus
        sync invalidates stale entries (#553). Returns ``""`` when git is
        unavailable, which safely disables caching for that call.
        """
        return self._run_git("rev-parse", "HEAD").strip()

    def get_file_log(self, relative_path: str, *, max_count: int = 50) -> list[LawVersion]:
        """Get commit history for a specific file.

        Returns a list of :class:`LawVersion` ordered newest-first. Cached
        per (path, max_count, corpus HEAD) so repeat visits to a law's
        "Versiones" tab are instant instead of re-running the ~9 s
        ``git log --follow`` (#553).
        """
        head = self.head_revision()
        if head:
            cache_key = (relative_path, max_count, head)
            cached = _FILE_LOG_CACHE.get(cache_key)
            if cached is not None:
                _FILE_LOG_CACHE.move_to_end(cache_key)
                return cached

        output = self._run_git(
            "log",
            f"--max-count={max_count}",
            "--follow",
            f"--format={_LOG_FORMAT}",
            "--",
            relative_path,
        )
        if not output.strip():
            return []

        records = output.split(_RECORD_SEP)
        versions: list[LawVersion] = []
        for record in records:
            record = record.strip()
            if not record:
                continue
            version = self._parse_log_entry(record)
            if version is not None:
                versions.append(version)

        if head:
            _FILE_LOG_CACHE[cache_key] = versions
            _FILE_LOG_CACHE.move_to_end(cache_key)
            while len(_FILE_LOG_CACHE) > _FILE_LOG_CACHE_MAXSIZE:
                _FILE_LOG_CACHE.popitem(last=False)
        return versions

    def _parse_log_entry(self, raw: str) -> LawVersion | None:
        """Parse a single git log entry into a :class:`LawVersion`."""
        lines = raw.strip().split("\n")
        if len(lines) < 3:
            return None

        commit_hash = lines[0].strip()
        date_str = lines[1].strip()
        message = lines[2].strip()
        body = "\n".join(lines[3:]) if len(lines) > 3 else ""

        try:
            commit_date = date.fromisoformat(date_str[:10])
        except ValueError:
            return None

        trailers = self._parse_trailers(body)

        return LawVersion(
            commit_hash=commit_hash,
            date=commit_date,
            message=message,
            norma=trailers.get("Norma"),
            disposicion=trailers.get("Disposición") or trailers.get("Disposicion"),
            articulos_afectados=_split_trailer_list(trailers.get("Artículos afectados", "")),
        )

    def _parse_trailers(self, body: str) -> dict[str, str]:
        """Extract git trailers (``Key: value``) from the commit message body."""
        trailers: dict[str, str] = {}
        for line in body.split("\n"):
            line = line.strip()
            if ": " in line:
                key, _, value = line.partition(": ")
                trailers[key.strip()] = value.strip()
        return trailers

    # ------------------------------------------------------------------
    # Diff
    # ------------------------------------------------------------------

    def get_diff(
        self,
        relative_path: str,
        from_commit: str,
        to_commit: str,
    ) -> LawDiff:
        """Get unified diff between two commits for a file."""
        diff_text = self._run_git(
            "diff",
            f"{from_commit}..{to_commit}",
            "--",
            relative_path,
        )
        stats = self._parse_diff_stats(diff_text)
        # Derive the relative law_id from the path
        law_id = Path(relative_path).stem

        return LawDiff(
            law_id=law_id,
            from_commit=from_commit,
            to_commit=to_commit,
            diff_text=diff_text,
            stats=stats,
        )

    def _parse_diff_stats(self, diff_text: str) -> DiffStats:
        """Count additions and deletions, and detect changed articles."""
        additions = 0
        deletions = 0
        for line in diff_text.split("\n"):
            if line.startswith("+") and not line.startswith("+++"):
                additions += 1
            elif line.startswith("-") and not line.startswith("---"):
                deletions += 1

        changed_articles = self._extract_changed_articles(diff_text)

        return DiffStats(
            additions=additions,
            deletions=deletions,
            changed_articles=changed_articles,
        )

    def _extract_changed_articles(self, diff_text: str) -> list[str]:
        """Scan only the added/removed lines for 'Articulo N' headings.

        Audit #409: the old implementation ran the pattern over the
        entire ``diff_text``, so any article header sitting in the 3
        lines of unchanged context around a hunk was reported as
        "changed". Now we restrict the scan to lines that start with
        ``+`` or ``-`` (excluding ``+++``/`---`` file headers), which
        matches the sibling ``_parse_diff_stats`` accounting.
        """
        seen: set[str] = set()
        result: list[str] = []
        for line in diff_text.split("\n"):
            if not line:
                continue
            prefix = line[0]
            if prefix not in {"+", "-"}:
                continue
            if line.startswith(("+++", "---")):
                continue
            match = _ARTICLE_HEADING_RE.search(line[1:])
            if not match:
                continue
            article = match.group(1)
            if article in seen:
                continue
            seen.add(article)
            result.append(article)
        return result


def _split_trailer_list(value: str) -> list[str]:
    """Split a comma-or-semicolon-separated trailer value into a list."""
    if not value or value.strip().upper() == "N/A":
        return []
    return [item.strip() for item in re.split(r"[,;]", value) if item.strip()]
