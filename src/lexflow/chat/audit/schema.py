"""Pydantic models for the Agent_Sudo audit schema.

Field names mirror the draft spec at
https://github.com/Kisyntra/Agent_Sudo/blob/main/spec/policy_audit_schema.md
(version ``v0.4.0-rc13``) verbatim. Extension fields use the
``lexflow_`` prefix per the existing convention in Ram's
``test_spec_helpers.py``.

Open spec issues that may move these names (we'll bump
:data:`SCHEMA_VERSION` and adjust on each landing):

* event_type taxonomy — https://github.com/Kisyntra/Agent_Sudo/issues/9
* payload_summary shape — https://github.com/Kisyntra/Agent_Sudo/issues/10
* approval_command vs approval_id — https://github.com/Kisyntra/Agent_Sudo/issues/11
* expires_at vs expires_in_seconds — https://github.com/Kisyntra/Agent_Sudo/issues/12
* schema_version placement — https://github.com/Kisyntra/Agent_Sudo/issues/13

--- WHERE TO CHANGE IF THE SPEC MOVES ---
* New ``Decision`` / ``Classification`` value → add to the enum here.
* Different ``schema_version`` string → bump :data:`SCHEMA_VERSION`.
* New top-level record field → add to :class:`AuditRecord` AND make sure
  it's serialised through :func:`lexflow.chat.audit.canonical.canonicalize_record`
  (Pydantic ``model_dump`` round-trips it automatically).
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from lexflow.chat.audit.canonical import compute_entry_hash

# Pinned against the published Agent_Sudo RC tag. When a spec issue lands
# that changes canonical bytes, this string bumps in the same commit as
# the field change so the cross-system interop test (`test_audit_interop`)
# fails loudly if the bytes drift.
SCHEMA_VERSION = "agent-sudo/0.4.0-rc13"


class Decision(StrEnum):
    """Authorization outcome enum from the draft schema."""

    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    REQUIRE_STRONG_APPROVAL = "REQUIRE_STRONG_APPROVAL"


class Classification(StrEnum):
    """Risk classification enum from the draft schema."""

    SAFE = "SAFE"
    SENSITIVE = "SENSITIVE"
    CRITICAL = "CRITICAL"
    BLOCKED = "BLOCKED"


class ApprovalMethod(StrEnum):
    """Approval method enum from the draft schema.

    String values rather than the screaming-snake style of the other
    enums because the spec lowercases them (`none`, `cli_confirm`, ...).
    """

    NONE = "none"
    CLI_CONFIRM = "cli_confirm"
    PASSPHRASE = "passphrase"
    DELEGATION = "delegation"


class SourceTrust(StrEnum):
    """Trust classification of the request origin."""

    USER_DIRECT = "USER_DIRECT"
    AGENT_INTERNAL = "AGENT_INTERNAL"
    EXTERNAL_CONTENT = "EXTERNAL_CONTENT"
    UNKNOWN = "UNKNOWN"


class AuditRequest(BaseModel):
    """Nested ``request`` block of an audit record.

    Mirrors the spec's required fields. ``payload_summary`` is the
    SHA-256 hex of the canonical JSON of the original call arguments
    (#10 proposal) — fixed 64 chars, language-agnostic.
    """

    actor: str
    source: str
    tool: str
    action: str
    target: str
    payload_summary: str
    source_trust: SourceTrust


class PolicyDecision(BaseModel):
    """Standalone policy verdict.

    Phase 1 only ever produces ``Decision.ALLOW`` + ``Classification.SAFE``
    + ``ApprovalMethod.NONE``. Phase 2 wires real evaluation; Phase 3
    populates the approval_* fields when a verdict requires it.
    """

    decision: Decision
    classification: Classification
    reason: str
    approval_method: ApprovalMethod
    approval_request_id: str | None = None
    approval_command: str | None = None
    approval_expires_at: str | None = None
    approval_expires_in_seconds: int | None = Field(default=None, ge=30, le=600)


class AuditRecord(BaseModel):
    """One line of ``mcp.log``.

    Fields with the ``lexflow_`` prefix are extensions (per Ram's
    existing test fixtures). They are included in canonical bytes so
    tampering still invalidates the chain.

    --- WHERE TO CHANGE IF THE SPEC MOVES ---
    Any new top-level field must round-trip through
    :func:`canonicalize_record` unchanged. Adding a field bumps
    :data:`SCHEMA_VERSION` because it changes the bytes hashed for every
    new record.
    """

    timestamp: str
    event_type: str
    request: AuditRequest
    decision: Decision
    classification: Classification
    reason: str
    approval_method: ApprovalMethod
    schema_version: str = SCHEMA_VERSION
    previous_hash: str
    entry_hash: str

    # Extension fields — optional, populated when context allows.
    lexflow_session_id: str | None = None
    lexflow_thread_id: str | None = None
    lexflow_outcome: str | None = None
    lexflow_error_message: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utc_iso_now() -> str:
    """Return a UTC ISO 8601 timestamp at second precision (``...Z``)."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _payload_summary(args: dict[str, object]) -> str:
    """Compute the canonical ``payload_summary`` for a call (#10 proposal).

    SHA-256 hex of the canonical JSON serialisation of the argument
    dict. Fixed 64 chars. Same canonicalisation rules as the hash
    chain so a third-party that already has ``canonicalize_record`` can
    recompute and compare without extra plumbing.
    """
    canonical = json.dumps(args, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _derive_target(tool_name: str, args: dict[str, object]) -> str:
    """Render a stable ``target`` identifier for a given call.

    Spec example targets look like ``"/path/to/file.txt"`` for filesystem
    tools — concrete enough to be searchable in the log.

    LexFlow tools work on law IDs and queries, so we mirror that style.
    """
    if "law_id" in args and "article_number" in args:
        return f"law:{args['law_id']}#article-{args['article_number']}"
    if "law_id" in args:
        return f"law:{args['law_id']}"
    if "query" in args:
        return f"query:{args['query']}"
    return f"tool:{tool_name}"


def build_audit_record(
    *,
    event_type: str,
    tool_name: str,
    args: dict[str, object],
    decision: PolicyDecision,
    previous_hash: str,
    outcome: str | None = None,
    error_message: str | None = None,
    lexflow_session_id: str | None = None,
    lexflow_thread_id: str | None = None,
) -> AuditRecord:
    """Assemble an :class:`AuditRecord` with the chain hash already set.

    The caller passes the prior chain hash (obtained from
    :meth:`AuditLog.read_last_hash`); we compute the canonical bytes,
    set ``entry_hash``, and return the validated model.

    --- WHERE TO CHANGE IF EVENT TAXONOMY EXPANDS ---
    ``event_type`` is a free string today; the proposed reserved set is
    ``tool_call_start``, ``tool_call_end``, ``policy_decision``,
    ``approval_request``, ``approval_response`` (Kisyntra/Agent_Sudo#9).
    Until that issue lands we don't validate the value, but the wrapper
    only ever passes those five strings.
    """
    request = AuditRequest(
        actor="lexflow-mcp",
        source="fastmcp",
        tool="lexflow",
        action=tool_name,
        target=_derive_target(tool_name, args),
        payload_summary=_payload_summary(args),
        source_trust=SourceTrust.AGENT_INTERNAL,
    )
    body = {
        "timestamp": _utc_iso_now(),
        "event_type": event_type,
        "request": request.model_dump(mode="json"),
        "decision": decision.decision.value,
        "classification": decision.classification.value,
        "reason": decision.reason,
        "approval_method": decision.approval_method.value,
        "schema_version": SCHEMA_VERSION,
        "previous_hash": previous_hash,
    }
    if lexflow_session_id is not None:
        body["lexflow_session_id"] = lexflow_session_id
    if lexflow_thread_id is not None:
        body["lexflow_thread_id"] = lexflow_thread_id
    if outcome is not None:
        body["lexflow_outcome"] = outcome
    if error_message is not None:
        body["lexflow_error_message"] = error_message[:512]

    entry_hash = compute_entry_hash(previous_hash, body)
    body["entry_hash"] = entry_hash
    return AuditRecord.model_validate(body)
