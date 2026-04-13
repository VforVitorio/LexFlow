"""Tests for MCP tool functions exposed by lexflow.chat.mcp_server."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent
from unittest.mock import patch

import pytest

from lexflow.core.registry import LawRegistry

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FRONTMATTER = dedent("""\
    title: "Ley 1/2000, de 7 de enero, de Enjuiciamiento Civil"
    identifier: "BOE-A-2000-323"
    country: "es"
    rank: "ley"
    publication_date: "2000-01-08"
    last_updated: "2025-06-15"
    status: "in_force"
    source: "https://www.boe.es/eli/es/l/2000/01/07/1/con"
    department: "Jefatura del Estado"
    enactment_date: "2000-01-07"
    official_journal: "BOE"
    journal_issue: "7"
    consolidation_status: "Finalizado"
    scope: "Estatal"
""")

LAW_BODY = dedent("""\
    # Ley 1/2000, de 7 de enero, de Enjuiciamiento Civil

    ## TITULO I. De las disposiciones generales

    ##### Articulo 1.

    En los procesos civiles, los tribunales y quienes ante ellos acudan
    e intervengan deberan actuar con arreglo a lo dispuesto en esta Ley.

    ##### Articulo 2.

    Las normas procesales contenidas en la presente Ley seran de
    aplicacion conforme a lo establecido en la Ley 20/2011.
""")


@pytest.fixture()
def real_registry(tmp_path: Path) -> LawRegistry:
    """Build a small but real LawRegistry for MCP tool tests."""
    law_file = tmp_path / "es" / "BOE-A-2000-323.md"
    law_file.parent.mkdir(parents=True, exist_ok=True)
    law_file.write_text(f"---\n{FRONTMATTER}---\n{LAW_BODY}", encoding="utf-8")
    registry = LawRegistry(tmp_path)
    registry.preload_all_metadata()
    return registry


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_search_law_returns_results(real_registry: LawRegistry) -> None:
    """search_law should return matching results for a known term."""
    from lexflow.chat.mcp_server import search_law

    with patch("lexflow.chat.mcp_server.get_registry", return_value=real_registry):
        result = search_law(query="enjuiciamiento")

    assert isinstance(result, dict)
    assert "total" in result
    assert result["total"] >= 1
    assert "items" in result
    assert len(result["items"]) >= 1
    first = result["items"][0]
    assert "law_id" in first
    assert "law_title" in first


async def test_get_stats_returns_total(real_registry: LawRegistry) -> None:
    """get_stats should return a dict with total_laws > 0."""
    from lexflow.chat.mcp_server import get_stats

    with patch("lexflow.chat.mcp_server.get_registry", return_value=real_registry):
        stats = get_stats()

    assert isinstance(stats, dict)
    assert "total_laws" in stats
    assert stats["total_laws"] > 0


async def test_get_law_found(real_registry: LawRegistry) -> None:
    """get_law should return law data for a known identifier."""
    from lexflow.chat.mcp_server import get_law

    with patch("lexflow.chat.mcp_server.get_registry", return_value=real_registry):
        result = get_law(law_id="BOE-A-2000-323")

    assert isinstance(result, dict)
    # The MCP server returns model_dump() which may include 'metadata' or direct fields
    assert "error" not in result


async def test_get_law_not_found(real_registry: LawRegistry) -> None:
    """get_law should return an error dict for an unknown identifier."""
    from lexflow.chat.mcp_server import get_law

    with patch("lexflow.chat.mcp_server.get_registry", return_value=real_registry):
        result = get_law(law_id="NONEXISTENT-9999")

    assert isinstance(result, dict)
    assert result.get("error") == "not_found"


async def test_get_article_found(real_registry: LawRegistry) -> None:
    """get_article should return article data for a known law and article number."""
    from lexflow.chat.mcp_server import get_article

    with patch("lexflow.chat.mcp_server.get_registry", return_value=real_registry):
        result = get_article(law_id="BOE-A-2000-323", article_number="1")

    assert isinstance(result, dict)
    assert "error" not in result
    # get_article returns article.model_dump() so "number" field should be present
    assert result.get("number") == "1" or result.get("article_number") == "1"


async def test_get_article_not_found(real_registry: LawRegistry) -> None:
    """get_article should return an error dict when article number does not exist."""
    from lexflow.chat.mcp_server import get_article

    with patch("lexflow.chat.mcp_server.get_registry", return_value=real_registry):
        result = get_article(law_id="BOE-A-2000-323", article_number="999")

    assert isinstance(result, dict)
    assert result.get("error") == "article_not_found"


async def test_search_law_no_results(real_registry: LawRegistry) -> None:
    """search_law should return total=0 when no laws match the query."""
    from lexflow.chat.mcp_server import search_law

    with patch("lexflow.chat.mcp_server.get_registry", return_value=real_registry):
        result = search_law(query="xyzzy_nonexistent_term_12345")

    assert result["total"] == 0
    assert result["items"] == []
