"""Cross-system interop gate against Agent_Sudo's reference verifier (#124).

Skipped unless the user has ``agent-sudo`` (>= 0.4.0-rc13) installed in
the test environment::

    pip install "agent-sudo>=0.4.0rc13"
    uv run pytest tests/test_audit_interop.py -v

When present, the test emits a small chain through our writer and runs
Ram's :func:`agent_sudo.spec_helpers.verify_jsonl_file` against the
output. If our canonical bytes drift from the spec — extra whitespace,
wrong key order, missed field — this test fails before the bytes ship
anywhere.

This is the CI gate that catches "we changed something and didn't
notice" in either direction:

* LexFlow regresses → our writer test passes (self-consistent) but this
  one fails.
* Agent_Sudo spec moves → both fail, telling us to bump
  :data:`SCHEMA_VERSION` and re-run.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from lexflow.chat.audit.log import AuditLog
from lexflow.chat.audit.schema import (
    ApprovalMethod,
    Classification,
    Decision,
    PolicyDecision,
    build_audit_record,
)

spec_helpers = pytest.importorskip(
    "agent_sudo.spec_helpers",
    reason="agent-sudo is an optional interop dependency — install with `pip install agent-sudo`",
)


@pytest.fixture()
def populated_log(tmp_path: Path) -> Path:
    log = AuditLog(tmp_path / "mcp.log")
    auto_allow = PolicyDecision(
        decision=Decision.ALLOW,
        classification=Classification.SAFE,
        reason="interop-test",
        approval_method=ApprovalMethod.NONE,
    )
    for query in ("habeas", "civil", "penal"):
        log.append(
            build_audit_record(
                event_type="tool_call_start",
                tool_name="search_law",
                args={"query": query},
                decision=auto_allow,
                previous_hash=log.read_last_hash(),
            ),
        )
        log.append(
            build_audit_record(
                event_type="tool_call_end",
                tool_name="search_law",
                args={"query": query},
                decision=auto_allow,
                previous_hash=log.read_last_hash(),
                outcome="success",
            ),
        )
    return log.path


class TestAgentSudoVerifierAcceptsLexFlowLog:
    def test_clean_lexflow_log_passes_agent_sudo_verifier(self, populated_log: Path) -> None:
        result = spec_helpers.verify_jsonl_file(populated_log)
        assert bool(result) is True, f"Agent_Sudo rejected our log: {result}"

    def test_tampering_one_line_breaks_agent_sudo_verifier(self, populated_log: Path) -> None:
        # Insert one byte into the first record's reason field. Our own
        # writer test asserts this breaks LexFlow's verifier; this asserts
        # the cross-system verifier sees the same break.
        text = populated_log.read_text(encoding="utf-8")
        text = text.replace("interop-test", "tampered-test", 1)
        populated_log.write_text(text, encoding="utf-8")
        result = spec_helpers.verify_jsonl_file(populated_log)
        assert bool(result) is False
