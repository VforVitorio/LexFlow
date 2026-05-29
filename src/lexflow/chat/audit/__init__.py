"""MCP audit log emission for issue #124.

Public surface of the audit subsystem:

* :class:`AuditLog` — append-only JSONL log with SHA-256 hash chain.
* :class:`AuditRecord` / :class:`PolicyDecision` — Pydantic models matching
  the Agent_Sudo draft schema ``v0.4.0-rc13`` (interop target tracked at
  https://github.com/Kisyntra/Agent_Sudo/issues/14).
* :func:`canonicalize_record` / :func:`compute_entry_hash` —
  reference-compatible canonical JSON + chain helpers (stdlib only).
* :func:`build_audit_record` — convenience constructor used by the MCP
  tool wrapper to assemble a record from call arguments.
* :func:`get_audit_log` — process-wide :class:`AuditLog` singleton bound
  to the location resolved from ``Settings.config_dir``.

Phase 1 (#124, this module) only emits records — every call is
auto-allowed with classification ``SAFE``. Real policy gating, consent
prompts and the SPA viewer land in later phases.
"""

from __future__ import annotations

from lexflow.chat.audit.canonical import (
    GENESIS_PREVIOUS_HASH,
    VerificationResult,
    canonicalize_record,
    compute_entry_hash,
    verify_chain,
)
from lexflow.chat.audit.log import AuditLog, get_audit_log
from lexflow.chat.audit.schema import (
    SCHEMA_VERSION,
    ApprovalMethod,
    AuditRecord,
    AuditRequest,
    Classification,
    Decision,
    PolicyDecision,
    SourceTrust,
    build_audit_record,
)

__all__ = [
    "GENESIS_PREVIOUS_HASH",
    "SCHEMA_VERSION",
    "ApprovalMethod",
    "AuditLog",
    "AuditRecord",
    "AuditRequest",
    "Classification",
    "Decision",
    "PolicyDecision",
    "SourceTrust",
    "VerificationResult",
    "build_audit_record",
    "canonicalize_record",
    "compute_entry_hash",
    "get_audit_log",
    "verify_chain",
]
