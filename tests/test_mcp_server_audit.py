"""Tests for the audit wrapper around MCP tools (#124 Phase 1).

Each tool call must produce a ``tool_call_start`` + ``tool_call_end``
record pair on the ``mcp.log`` chain, regardless of success or
exception. The underlying tool's return value must not be perturbed.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pytest import MonkeyPatch

from lexflow.chat.audit import get_audit_log


@pytest.fixture()
def audit_log_path() -> Path:
    """Resolve the audit log path used by the isolated test config dir.

    The repo-wide ``_isolated_config_dir`` fixture in ``conftest.py``
    has already pointed ``LEXFLOW_CONFIG_DIR`` at a per-test temp dir
    and cleared the singletons. We just resolve where the file will
    land via the public accessor.
    """
    return get_audit_log().path


def _lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


class TestAuditWrapperEmitsPair:
    def test_search_law_writes_start_and_end_records(self, audit_log_path: Path) -> None:
        # Imported here so the monkeypatched env is in effect when
        # `get_audit_log` resolves the path.
        from lexflow.chat.mcp_server import search_law

        result = search_law("habeas")
        assert isinstance(result, dict)

        lines = _lines(audit_log_path)
        assert len(lines) == 2
        assert lines[0]["event_type"] == "tool_call_start"
        assert lines[1]["event_type"] == "tool_call_end"
        assert lines[1]["lexflow_outcome"] == "success"

    def test_get_law_records_target_with_law_id(self, audit_log_path: Path) -> None:
        from lexflow.chat.mcp_server import get_law

        get_law("BOE-A-2018-16673")
        lines = _lines(audit_log_path)
        assert all(line["request"]["target"] == "law:BOE-A-2018-16673" for line in lines)

    def test_chain_remains_valid_across_multiple_tool_calls(self, audit_log_path: Path) -> None:
        from lexflow.chat.audit import get_audit_log
        from lexflow.chat.mcp_server import get_stats, search_law

        search_law("civil")
        get_stats()
        search_law("penal")

        log = get_audit_log()
        result = log.verify()
        assert result.success is True
        # Three calls x two events each = six records.
        assert len(_lines(audit_log_path)) == 6

    def test_record_carries_search_law_action_and_actor(self, audit_log_path: Path) -> None:
        from lexflow.chat.mcp_server import search_law

        search_law("civil")
        first = _lines(audit_log_path)[0]
        assert first["request"]["action"] == "search_law"
        assert first["request"]["actor"] == "lexflow-mcp"
        assert first["request"]["tool"] == "lexflow"


class TestAuditWrapperPolicyDeny:
    def test_blocked_tool_returns_policy_denied_dict_and_skips_function(
        self, audit_log_path: Path, monkeypatch: MonkeyPatch
    ) -> None:
        """Sprint 4 / #124 Phase 2: the env-var block-list short-circuits
        the underlying function and the wrapper returns the denial dict."""
        from lexflow.chat import mcp_server
        from lexflow.chat.audit import BLOCKED_TOOLS_ENV_VAR
        from lexflow.core.registry import LawRegistry

        monkeypatch.setenv(BLOCKED_TOOLS_ENV_VAR, "search_law")

        # Sentinel that registers a call if the underlying tool ever
        # runs — it must NOT for a denied request.
        called: list[bool] = []

        def _should_not_run(self: object, *args: object, **kwargs: object) -> object:
            called.append(True)
            return {"items": [], "total": 0}

        monkeypatch.setattr(LawRegistry, "search_text", _should_not_run)

        result = mcp_server.search_law("anything")
        assert called == []  # policy refused before function ran
        assert result == {
            "error": "policy_denied",
            "decision": "DENY",
            "classification": "BLOCKED",
            "reason": result["reason"],
        }
        assert "LEXFLOW_MCP_BLOCKED_TOOLS" in result["reason"]

        lines = _lines(audit_log_path)
        assert len(lines) == 2
        assert lines[0]["decision"] == "DENY"
        assert lines[0]["classification"] == "BLOCKED"
        assert lines[1]["event_type"] == "tool_call_end"
        assert lines[1]["lexflow_outcome"] == "denied"


class TestAuditWrapperOnError:
    def test_exception_in_tool_still_emits_end_record_with_error_outcome(
        self,
        audit_log_path: Path,
        monkeypatch: MonkeyPatch,
    ) -> None:
        from lexflow.chat import mcp_server

        def _boom(self: object, query: str, *, page: int, page_size: int) -> object:
            del self, query, page, page_size
            raise RuntimeError("registry exploded")

        # Patch the registry the wrapped tool calls into. The decorator
        # itself doesn't know about this — we're asserting that the
        # audit pair fires across the exception boundary.
        from lexflow.core.registry import LawRegistry

        monkeypatch.setattr(LawRegistry, "search_text", _boom)

        with pytest.raises(RuntimeError, match="registry exploded"):
            mcp_server.search_law("anything")

        lines = _lines(audit_log_path)
        assert len(lines) == 2
        assert lines[1]["event_type"] == "tool_call_end"
        assert lines[1]["lexflow_outcome"] == "error"
        assert "registry exploded" in lines[1]["lexflow_error_message"]
