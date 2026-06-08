"""Policy engine for the MCP audit log (#124 Phase 2).

Phase 1 (already in main since 2026-05-29) emits audit records but
auto-allows every tool call. Phase 2 — this module — replaces the
auto-allow with a real ``evaluate(request)`` that branches on the tool
name and the operator's configuration.

Design choices, deliberately conservative:

* **Default deny** for unknown tools. The MCP surface today is four
  read-only registry lookups; any new tool starts blocked and lights
  up only when an entry is added to the allow-list below.
* **No async approval queue yet**. The Agent_Sudo draft schema defines
  ``REQUIRE_APPROVAL`` / ``REQUIRE_STRONG_APPROVAL`` semantics but the
  in-app consent gate that backs them belongs to Phase 3 (depends on
  the LexFlow SPA hosting an MCP server in-process). Phase 2 keeps the
  decision space to ``ALLOW`` / ``DENY`` so the policy is fully sync
  and easy to test.
* **Configuration via env var**, not the on-disk config file. Two
  reasons: (a) it doesn't require a UI to surface, (b) MCP servers
  typically launch from a parent agent that already sets env vars per
  session. The Settings page reads back the same env var so the user
  can see what's blocked at the current process's launch.

--- WHERE TO CHANGE IF X CHANGES ---
* New MCP tool added       → extend :data:`READ_ONLY_TOOLS` (and remove
                              it from there if it becomes destructive).
* Block-list source        → :func:`_blocked_tools`. Today reads env.
* Approval-queue plumbing  → out of scope; tracked as Phase 3.
"""

from __future__ import annotations

import logging
import os

from lexflow.chat.audit.schema import (
    ApprovalMethod,
    AuditRequest,
    Classification,
    Decision,
    PolicyDecision,
)

logger = logging.getLogger(__name__)


# MCP tools the LexFlow server exposes today. All are read-only lookups
# against the in-memory registry — pure functions of the corpus. They
# read no PII, mutate nothing on disk, and never reach a network.
# Adding a new MCP tool means appending its name here (or, if it's
# destructive, NOT appending and shipping a Phase 3 consent prompt for
# it).
READ_ONLY_TOOLS: frozenset[str] = frozenset(
    {
        "search_law",
        "search_semantic_top_k",
        "get_law",
        "get_article",
        "get_stats",
    }
)


# Operator-facing env var. Comma-separated tool names. Empty / unset
# means "no overrides; use the built-in policy". A tool that appears
# here is denied even if it would otherwise be allowed by
# ``READ_ONLY_TOOLS`` — this is the kill-switch for an operator who
# wants to silence a single tool without shutting the whole server.
BLOCKED_TOOLS_ENV_VAR = "LEXFLOW_MCP_BLOCKED_TOOLS"


def _blocked_tools() -> frozenset[str]:
    """Return the operator-configured block-list, sourced from env.

    Re-reads on every call so a session can update the env var without
    a process restart (useful in tests; a real MCP run will likely set
    it once at launch).
    """
    raw = os.environ.get(BLOCKED_TOOLS_ENV_VAR, "")
    names = {chunk.strip() for chunk in raw.split(",") if chunk.strip()}
    return frozenset(names)


def evaluate(request: AuditRequest) -> PolicyDecision:
    """Decide whether *request* should be allowed.

    Returns a :class:`PolicyDecision` regardless of outcome — the
    caller (the MCP tool wrapper) appends the decision to the audit
    log either way and refuses to invoke the underlying function when
    ``decision != ALLOW``.

    Order of checks:
    1. Operator block-list (env var). Wins over everything.
    2. Read-only allow-list. ``ALLOW`` + ``SAFE``.
    3. Default deny — anything not explicitly safe is denied.
    """
    blocked = _blocked_tools()
    if request.action in blocked:
        return PolicyDecision(
            decision=Decision.DENY,
            classification=Classification.BLOCKED,
            reason=f"Tool {request.action!r} is blocked via {BLOCKED_TOOLS_ENV_VAR}",
            approval_method=ApprovalMethod.NONE,
        )

    if request.action in READ_ONLY_TOOLS:
        return PolicyDecision(
            decision=Decision.ALLOW,
            classification=Classification.SAFE,
            reason="Read-only registry lookup",
            approval_method=ApprovalMethod.NONE,
        )

    logger.warning(
        "Denying unknown MCP tool %r — not on READ_ONLY_TOOLS allow-list. "
        "If this is a new safe tool, extend lexflow.chat.audit.policy.READ_ONLY_TOOLS.",
        request.action,
    )
    return PolicyDecision(
        decision=Decision.DENY,
        classification=Classification.SENSITIVE,
        reason=(
            f"Unknown tool {request.action!r} — not on the read-only allow-list. "
            "Phase 3 will add an interactive consent prompt for sensitive tools."
        ),
        approval_method=ApprovalMethod.NONE,
    )
