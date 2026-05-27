"""Tests for the FastMCP tool functions (issue #103).

The MCP tools in :mod:`lexflow.chat.mcp_server` call ``get_registry()``
internally. We monkeypatch that import binding so each test runs
against the fixture registry built from sample_law_dir.

The ``@mcp.tool()`` decorator wraps each function; ``.fn`` gives us
the plain callable underneath when the decorator returns a wrapper
(FastMCP's runtime convention).
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest
from pytest import MonkeyPatch

from lexflow.chat import mcp_server
from lexflow.core.registry import LawRegistry


def _unwrap(tool: object) -> Callable[..., dict]:
    """Return the plain function inside a FastMCP tool wrapper.

    FastMCP versions either expose the wrapped function as `.fn` or
    leave the original callable in place. Handle both.
    """
    fn = getattr(tool, "fn", tool)
    assert callable(fn)
    return fn  # type: ignore[return-value]


@pytest.fixture()
def patched_registry(sample_law_dir: Path, monkeypatch: MonkeyPatch) -> LawRegistry:
    """Patch ``get_registry`` inside the MCP module so the tools see
    the fixture data rather than the real legalize-es submodule.
    """
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    monkeypatch.setattr(mcp_server, "get_registry", lambda: registry)
    return registry


class TestSearchLaw:
    def test_returns_paginated_results_payload(self, patched_registry: LawRegistry) -> None:
        del patched_registry
        result = _unwrap(mcp_server.search_law)(query="Enjuiciamiento")
        assert isinstance(result, dict)
        assert "items" in result
        assert "total" in result
        assert result["total"] >= 0


class TestGetLaw:
    def test_returns_full_law_payload(self, patched_registry: LawRegistry) -> None:
        law_id = patched_registry.law_ids[0]
        result = _unwrap(mcp_server.get_law)(law_id=law_id)
        assert result.get("metadata", {}).get("identifier") == law_id
        assert isinstance(result.get("articles"), list)

    def test_unknown_id_returns_error_dict(self, patched_registry: LawRegistry) -> None:
        del patched_registry
        result = _unwrap(mcp_server.get_law)(law_id="DOES-NOT-EXIST")
        assert result == {"error": "not_found", "law_id": "DOES-NOT-EXIST"}


class TestGetArticle:
    def test_returns_article_payload(self, patched_registry: LawRegistry) -> None:
        # Sample fixture has at least article "1" on BOE-A-2000-323.
        del patched_registry
        result = _unwrap(mcp_server.get_article)(law_id="BOE-A-2000-323", article_number="1")
        assert result.get("number") == "1"

    def test_unknown_law_returns_error(self, patched_registry: LawRegistry) -> None:
        del patched_registry
        result = _unwrap(mcp_server.get_article)(law_id="MISSING", article_number="1")
        assert result == {"error": "not_found", "law_id": "MISSING"}

    def test_unknown_article_returns_error(self, patched_registry: LawRegistry) -> None:
        del patched_registry
        result = _unwrap(mcp_server.get_article)(law_id="BOE-A-2000-323", article_number="9999")
        assert result["error"] == "article_not_found"
        assert result["article_number"] == "9999"


class TestGetStats:
    def test_returns_total_laws_count(self, patched_registry: LawRegistry) -> None:
        result = _unwrap(mcp_server.get_stats)()
        assert result == {"total_laws": patched_registry.total_count}
