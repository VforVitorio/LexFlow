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

Phase 1 (already in main since 2026-05-29) emits records — auto-allow.

Phase 2 (this PR) adds :func:`lexflow.chat.audit.policy.evaluate` so
the MCP wrapper makes real ``ALLOW`` / ``DENY`` decisions per call,
gated by a built-in read-only allow-list + an operator env-var
block-list. The interactive consent prompt (``REQUIRE_APPROVAL`` /
``REQUIRE_STRONG_APPROVAL``) lands in Phase 3 once LexFlow hosts an
MCP server in-process and can show a SPA modal.
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
from lexflow.chat.audit.policy import (
    BLOCKED_TOOLS_ENV_VAR,
    READ_ONLY_TOOLS,
    evaluate,
)
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
    make_audit_request,
)

__all__ = [
    "BLOCKED_TOOLS_ENV_VAR",
    "GENESIS_PREVIOUS_HASH",
    "READ_ONLY_TOOLS",
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
    "evaluate",
    "get_audit_log",
    "make_audit_request",
    "verify_chain",
]
