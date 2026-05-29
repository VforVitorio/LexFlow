"""Canonical JSON serialisation + SHA-256 hash chain.

Reference implementation of the algorithm specified at
https://github.com/Kisyntra/Agent_Sudo/blob/main/spec/canonical_hash_chain.md
(version ``v0.4.0-rc13``). Stdlib-only on purpose so this module can be
re-used outside LexFlow without dragging the chat stack along.

Spec summary that this code matches verbatim:

* JSON keys sorted alphabetically by Unicode codepoint at every nesting level.
* No whitespace outside string literals; commas and colons unspaced.
* UTF-8 byte stream; non-ASCII characters emitted as their UTF-8 bytes,
  not as ``\\uXXXX`` escapes.
* Integers in base-10 with no leading zeros.
* ``entry_hash`` is removed before canonicalisation (the field whose
  value we're computing must not be in its own input).
* SHA-256 over ``previous_hash.encode("utf-8") + canonical_bytes``,
  lowercase hex.
* Genesis ``previous_hash`` = ``"0" * 64``.
* JSONL on disk, one canonical object per line, ``\\n`` terminator
  (including a trailing newline).

Cross-system compatibility is verified by ``tests/test_audit_interop.py``
which runs Ram's ``agent_sudo.spec_helpers.verify_jsonl_file()`` against
the output of this module. If a spec issue lands that changes a rule
above, the interop test fails before anything else does.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

GENESIS_PREVIOUS_HASH = "0" * 64


@dataclass(frozen=True)
class VerificationResult:
    """Outcome of a hash-chain verification pass.

    Mirrors the public shape of Ram's ``spec_helpers.VerificationResult``
    so a caller can swap between implementations without changing call
    sites.
    """

    success: bool
    line_number: int | None = None
    expected_hash: str | None = None
    actual_hash: str | None = None
    reason: str | None = None

    def __bool__(self) -> bool:
        return self.success

    def __str__(self) -> str:
        if self.success:
            return "audit log verified"
        location = f" at line {self.line_number}" if self.line_number is not None else ""
        return f"verification failed{location}: {self.reason or 'unknown'}"


def canonicalize_record(record: Mapping[str, object]) -> bytes:
    """Serialise *record* using the canonical rules, excluding ``entry_hash``.

    Returns raw UTF-8 bytes ready to feed into SHA-256.
    """
    payload = {k: v for k, v in record.items() if k != "entry_hash"}
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def compute_entry_hash(previous_hash: str, record: Mapping[str, object]) -> str:
    """Compute the SHA-256 ``entry_hash`` for *record*.

    Concatenates ``previous_hash`` as UTF-8 bytes with the canonical
    bytes of the record (sans its ``entry_hash`` field) and returns the
    lowercase hex digest.
    """
    canonical = canonicalize_record(record)
    return hashlib.sha256(previous_hash.encode("utf-8") + canonical).hexdigest()


def verify_chain(records: Iterable[Mapping[str, object]]) -> VerificationResult:
    """Walk *records* in order, verifying ``previous_hash`` + ``entry_hash``.

    Genesis record must carry ``previous_hash == GENESIS_PREVIOUS_HASH``.
    First mismatch wins; remaining records are not checked once a fault
    is found.
    """
    expected_prev = GENESIS_PREVIOUS_HASH
    for line_number, record in enumerate(records, start=1):
        prev = record.get("previous_hash")
        if prev != expected_prev:
            return VerificationResult(
                success=False,
                line_number=line_number,
                expected_hash=expected_prev,
                actual_hash=prev if isinstance(prev, str) else None,
                reason="previous_hash mismatch",
            )
        actual_entry = record.get("entry_hash")
        if not isinstance(actual_entry, str):
            return VerificationResult(
                success=False,
                line_number=line_number,
                reason="entry_hash missing or non-string",
            )
        recomputed = compute_entry_hash(expected_prev, record)
        if actual_entry != recomputed:
            return VerificationResult(
                success=False,
                line_number=line_number,
                expected_hash=recomputed,
                actual_hash=actual_entry,
                reason="entry_hash mismatch",
            )
        expected_prev = actual_entry
    return VerificationResult(success=True)


def verify_jsonl_file(path: Path) -> VerificationResult:
    """Read a JSONL audit log from *path* and verify its hash chain.

    Blank lines are skipped. A line that fails to parse as JSON is
    reported with line number + reason but does NOT raise — callers
    expect a single :class:`VerificationResult`.
    """
    if not path.exists():
        return VerificationResult(success=False, reason=f"file not found: {path}")

    records: list[dict[str, object]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_number, raw in enumerate(fh, start=1):
            stripped = raw.strip()
            if not stripped:
                continue
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError as exc:
                return VerificationResult(
                    success=False,
                    line_number=line_number,
                    reason=f"invalid JSON: {exc.msg}",
                )
            if not isinstance(parsed, dict):
                return VerificationResult(
                    success=False,
                    line_number=line_number,
                    reason="line is not a JSON object",
                )
            records.append(parsed)
    return verify_chain(records)
