"""Tests for the MCP policy engine (#124 Phase 2)."""

from __future__ import annotations

import pytest
from pytest import MonkeyPatch

from lexflow.chat.audit import (
    BLOCKED_TOOLS_ENV_VAR,
    READ_ONLY_TOOLS,
    Classification,
    Decision,
    evaluate,
    make_audit_request,
)


def _request(tool: str) -> object:
    return make_audit_request(tool, {"query": "civil"})


class TestPolicyAllow:
    def test_each_read_only_tool_is_allowed(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.delenv(BLOCKED_TOOLS_ENV_VAR, raising=False)
        for tool in READ_ONLY_TOOLS:
            verdict = evaluate(_request(tool))
            assert verdict.decision is Decision.ALLOW, tool
            assert verdict.classification is Classification.SAFE, tool


class TestPolicyDenyUnknown:
    def test_unknown_tool_is_denied_with_sensitive_classification(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.delenv(BLOCKED_TOOLS_ENV_VAR, raising=False)
        verdict = evaluate(_request("delete_law"))
        assert verdict.decision is Decision.DENY
        assert verdict.classification is Classification.SENSITIVE
        assert "delete_law" in verdict.reason


class TestPolicyBlockList:
    def test_blocklist_overrides_read_only(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv(BLOCKED_TOOLS_ENV_VAR, "search_law")
        verdict = evaluate(_request("search_law"))
        assert verdict.decision is Decision.DENY
        assert verdict.classification is Classification.BLOCKED
        assert BLOCKED_TOOLS_ENV_VAR in verdict.reason

    def test_blocklist_comma_separated_with_spaces(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv(BLOCKED_TOOLS_ENV_VAR, " search_law , get_stats ")
        assert evaluate(_request("search_law")).decision is Decision.DENY
        assert evaluate(_request("get_stats")).decision is Decision.DENY
        # Untouched entries still pass.
        assert evaluate(_request("get_law")).decision is Decision.ALLOW

    def test_empty_blocklist_uses_built_in_policy(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv(BLOCKED_TOOLS_ENV_VAR, "")
        assert evaluate(_request("search_law")).decision is Decision.ALLOW

    def test_blocklist_does_not_resurrect_unknown_tools(self, monkeypatch: MonkeyPatch) -> None:
        # The block-list narrows what's allowed; it never expands it.
        monkeypatch.setenv(BLOCKED_TOOLS_ENV_VAR, "delete_law")
        verdict = evaluate(_request("delete_law"))
        assert verdict.decision is Decision.DENY
        # Still hits the block-list branch first since the action is in it.
        assert verdict.classification is Classification.BLOCKED


@pytest.fixture(autouse=True)
def _isolated_env(monkeypatch: MonkeyPatch) -> None:
    """Make sure no other test leaks the env var into ours."""
    monkeypatch.delenv(BLOCKED_TOOLS_ENV_VAR, raising=False)
