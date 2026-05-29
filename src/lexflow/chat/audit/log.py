"""Append-only JSONL audit log with hash-chained records.

The log lives at ``<config_dir>/mcp.log`` (see
``LEXFLOW_CONFIG_DIR``). Each line is one canonical-JSON
:class:`AuditRecord`. The chain is anchored by ``previous_hash`` /
``entry_hash`` so any tampering — including reordering, truncation, or
silent edits — is detectable with
:meth:`AuditLog.verify` (or a third-party verifier such as
``agent-sudo verify-audit``).

Concurrency: a per-instance :class:`threading.Lock` serialises appends
so multi-threaded MCP servers can't interleave bytes mid-record. The
lock is held only across ``read_last_hash + serialise + write``; tool
execution time stays outside it.
"""

from __future__ import annotations

import json
import logging
import threading
from functools import lru_cache
from pathlib import Path

from lexflow.chat.audit.canonical import (
    GENESIS_PREVIOUS_HASH,
    VerificationResult,
    canonicalize_record,
    verify_jsonl_file,
)
from lexflow.chat.audit.schema import AuditRecord
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

LOG_FILE_NAME = "mcp.log"


class AuditLog:
    """Append-only JSONL log with hash-chained records."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        """Absolute path of the backing JSONL file."""
        return self._path

    def read_last_hash(self) -> str:
        """Return the ``entry_hash`` of the last record, or the genesis value.

        Cheap on small logs; reads the file end-to-end. We'll add a
        tail-only optimisation if `mcp.log` grows past tens of MB —
        right now correctness beats micro-optimisation.
        """
        if not self._path.exists():
            return GENESIS_PREVIOUS_HASH
        last_hash: str | None = None
        with self._path.open("r", encoding="utf-8") as fh:
            for raw in fh:
                stripped = raw.strip()
                if not stripped:
                    continue
                try:
                    parsed = json.loads(stripped)
                except json.JSONDecodeError:
                    # Corrupt tail — leave to `verify()` to report. For
                    # the purposes of "where do I anchor the next
                    # write", we conservatively keep the last good hash.
                    continue
                if isinstance(parsed, dict) and isinstance(parsed.get("entry_hash"), str):
                    last_hash = parsed["entry_hash"]
        return last_hash if last_hash is not None else GENESIS_PREVIOUS_HASH

    def append(self, record: AuditRecord) -> None:
        """Append *record* to the JSONL file in canonical form.

        Writes the SAME bytes that fed into :func:`compute_entry_hash`
        (sans the ``entry_hash`` removal step) so verification is
        trivially round-trippable. The trailing newline is required by
        the spec.

        Raises :class:`ValueError` if ``record.previous_hash`` doesn't
        match the current chain tail — callers should always derive it
        from :meth:`read_last_hash` inside the same lock window.
        """
        with self._lock:
            expected_prev = self.read_last_hash()
            if record.previous_hash != expected_prev:
                raise ValueError(
                    f"chain break: record carries previous_hash={record.previous_hash!r} "
                    f"but log tail is {expected_prev!r}",
                )
            self._path.parent.mkdir(parents=True, exist_ok=True)
            body = record.model_dump(mode="json", exclude_none=True)
            # Re-emit using the same canonical rules as the hash input,
            # then re-attach entry_hash so the line is self-describing.
            entry_hash = body.pop("entry_hash")
            canonical = canonicalize_record(body).decode("utf-8")
            # Insert entry_hash in canonical position (sorted keys).
            line_record = json.loads(canonical)
            line_record["entry_hash"] = entry_hash
            line = json.dumps(line_record, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            with self._path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")

    def verify(self) -> VerificationResult:
        """Re-read the log and validate the hash chain end-to-end."""
        return verify_jsonl_file(self._path)


@lru_cache(maxsize=1)
def get_audit_log() -> AuditLog:
    """Return the process-wide :class:`AuditLog` singleton."""
    settings = get_settings()
    return AuditLog(settings.config_dir / LOG_FILE_NAME)


def reset_audit_log_cache() -> None:
    """Drop the singleton — used by tests that point ``config_dir`` elsewhere."""
    get_audit_log.cache_clear()
