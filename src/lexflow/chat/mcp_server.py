"""FastMCP server exposing LexFlow legal tools to AI assistants."""
from __future__ import annotations

import logging

from fastmcp import FastMCP

from lexflow.core.exceptions import LawNotFoundError
from lexflow.core.registry import get_registry

logger = logging.getLogger(__name__)

mcp: FastMCP = FastMCP("lexflow-legal")


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def search_law(query: str) -> dict:  # type: ignore[type-arg]
    """Search for laws by text query.

    Args:
        query: Free-text search query.

    Returns:
        Paginated search results with law IDs, titles, article numbers and snippets.
    """
    registry = get_registry()
    result = registry.search_text(query, page=1, page_size=10)
    return result.model_dump()


@mcp.tool()
def get_law(law_id: str) -> dict:  # type: ignore[type-arg]
    """Retrieve the full content of a law by its BOE identifier.

    Args:
        law_id: BOE identifier of the law (e.g. 'BOE-A-1978-31229').

    Returns:
        Full law data including metadata, sections, articles and cross-references.
    """
    registry = get_registry()
    try:
        law = registry.get_law(law_id)
    except LawNotFoundError:
        return {"error": "not_found", "law_id": law_id}
    return law.model_dump()


@mcp.tool()
def get_article(law_id: str, article_number: str) -> dict:  # type: ignore[type-arg]
    """Retrieve a specific article from a law.

    Args:
        law_id: BOE identifier of the law.
        article_number: Article number string (e.g. '1', '2 bis').

    Returns:
        Article data, or an error dict if the law or article is not found.
    """
    registry = get_registry()
    try:
        law = registry.get_law(law_id)
    except LawNotFoundError:
        return {"error": "not_found", "law_id": law_id}

    for article in law.articles:
        if article.number == article_number:
            return article.model_dump()

    return {"error": "article_not_found", "law_id": law_id, "article_number": article_number}


@mcp.tool()
def get_stats() -> dict:  # type: ignore[type-arg]
    """Return aggregate statistics about the LexFlow law registry.

    Returns:
        Dict with total_laws count.
    """
    registry = get_registry()
    return {"total_laws": registry.total_count}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run() -> None:
    """Start the MCP server."""
    mcp.run()


if __name__ == "__main__":
    run()
