"""Tests for the on-disk JSONL audit log (#124 Phase 1)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from lexflow.chat.audit.canonical import GENESIS_PREVIOUS_HASH, compute_entry_hash, verify_jsonl_file
from lexflow.chat.audit.log import AuditLog
from lexflow.chat.audit.schema import (
    ApprovalMethod,
    Classification,
    Decision,
    PolicyDecision,
    build_audit_record,
)

_AUTO_ALLOW = PolicyDecision(
    decision=Decision.ALLOW,
    classification=Classification.SAFE,
    reason="test",
    approval_method=ApprovalMethod.NONE,
)


def _record(prev_hash: str, event_type: str = "tool_call_start") -> object:
    return build_audit_record(
        event_type=event_type,
        tool_name="search_law",
        args={"query": "habeas corpus"},
        decision=_AUTO_ALLOW,
        previous_hash=prev_hash,
    )


class TestAuditLogAppendRoundtrip:
    def test_empty_log_returns_genesis_hash(self, tmp_path: Path) -> None:
        log = AuditLog(tmp_path / "mcp.log")
        assert log.read_last_hash() == GENESIS_PREVIOUS_HASH

    def test_three_appended_records_form_a_valid_chain(self, tmp_path: Path) -> None:
        log = AuditLog(tmp_path / "mcp.log")
        for _ in range(3):
            log.append(_record(log.read_last_hash()))
        result = log.verify()
        assert result.success is True

    def test_log_file_is_jsonl_with_trailing_newline(self, tmp_path: Path) -> None:
        log = AuditLog(tmp_path / "mcp.log")
        log.append(_record(log.read_last_hash()))
        content = (tmp_path / "mcp.log").read_text(encoding="utf-8")
        assert content.endswith("\n")
        lines = [ln for ln in content.split("\n") if ln]
        assert len(lines) == 1
        parsed = json.loads(lines[0])
        assert parsed["event_type"] == "tool_call_start"
        assert parsed["entry_hash"]
        assert parsed["previous_hash"] == GENESIS_PREVIOUS_HASH

    def test_append_rejects_record_whose_previous_hash_doesnt_match_tail(self, tmp_path: Path) -> None:
        log = AuditLog(tmp_path / "mcp.log")
        log.append(_record(log.read_last_hash()))
        # Build a second record but anchor it at the genesis hash instead
        # of the actual tail — the log must refuse it.
        stale = _record(GENESIS_PREVIOUS_HASH)
        with pytest.raises(ValueError, match="chain break"):
            log.append(stale)

    def test_appending_creates_parent_directory(self, tmp_path: Path) -> None:
        log = AuditLog(tmp_path / "nested" / "deeper" / "mcp.log")
        log.append(_record(log.read_last_hash()))
        assert (tmp_path / "nested" / "deeper" / "mcp.log").exists()


class TestAuditLogTamperDetection:
    def test_tampering_a_byte_breaks_verification(self, tmp_path: Path) -> None:
        path = tmp_path / "mcp.log"
        log = AuditLog(path)
        log.append(_record(log.read_last_hash()))
        log.append(_record(log.read_last_hash()))
        # Tamper the FIRST line's reason field.
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        lines[0] = lines[0].replace('"test"', '"FORGED"')
        path.write_text("".join(lines), encoding="utf-8")
        result = log.verify()
        assert result.success is False
        assert result.line_number == 1
        assert result.reason == "entry_hash mismatch"

    def test_reordering_lines_breaks_verification(self, tmp_path: Path) -> None:
        path = tmp_path / "mcp.log"
        log = AuditLog(path)
        log.append(_record(log.read_last_hash()))
        log.append(_record(log.read_last_hash()))
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        path.write_text(lines[1] + lines[0], encoding="utf-8")
        result = log.verify()
        assert result.success is False

    def test_missing_file_reports_failure_without_raising(self, tmp_path: Path) -> None:
        result = verify_jsonl_file(tmp_path / "does_not_exist.log")
        assert result.success is False
        assert result.reason is not None
        assert "not found" in result.reason


class TestBuildAuditRecord:
    def test_record_carries_required_top_level_fields(self) -> None:
        record = _record(GENESIS_PREVIOUS_HASH)
        body = record.model_dump(mode="json", exclude_none=True)
        for field in (
            "timestamp",
            "event_type",
            "request",
            "decision",
            "classification",
            "reason",
            "approval_method",
            "schema_version",
            "previous_hash",
            "entry_hash",
        ):
            assert field in body, f"missing required field: {field}"

    def test_request_block_includes_payload_summary_as_sha256_hex(self) -> None:
        record = _record(GENESIS_PREVIOUS_HASH)
        payload_summary = record.request.payload_summary
        assert len(payload_summary) == 64
        int(payload_summary, 16)

    def test_entry_hash_recomputes_to_the_stored_value(self) -> None:
        record = _record(GENESIS_PREVIOUS_HASH)
        body = record.model_dump(mode="json", exclude_none=True)
        recomputed = compute_entry_hash(body["previous_hash"], body)
        assert recomputed == body["entry_hash"]

    def test_target_derives_from_query_when_present(self) -> None:
        record = build_audit_record(
            event_type="tool_call_start",
            tool_name="search_law",
            args={"query": "civil"},
            decision=_AUTO_ALLOW,
            previous_hash=GENESIS_PREVIOUS_HASH,
        )
        assert record.request.target == "query:civil"

    def test_target_combines_law_id_and_article_number(self) -> None:
        record = build_audit_record(
            event_type="tool_call_start",
            tool_name="get_article",
            args={"law_id": "BOE-A-2018-16673", "article_number": "5"},
            decision=_AUTO_ALLOW,
            previous_hash=GENESIS_PREVIOUS_HASH,
        )
        assert record.request.target == "law:BOE-A-2018-16673#article-5"
