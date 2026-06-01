"""Shared business-logic helpers used by both the REST routers and the
MCP tool wrappers (#104 #10).

Before this module existed, ``articles.py`` had a private ``_find_article``
helper with article-number normalisation (trims whitespace + trailing
dots) and ``mcp_server.get_article`` did a less-forgiving exact match.
Two implementations, one of them subtly buggy. Centralising here keeps
the contract single-sourced; downstream callers stay thin.

--- WHERE TO CHANGE IF X CHANGES ---
* Article number normalisation rules → :func:`_normalise_article_number`.
* New shared lookup                  → add a function here, NOT a second
                                       copy under ``api/routers`` or
                                       ``chat/mcp_server``.
"""

from __future__ import annotations

from lexflow.core.models import Article, Law


def _normalise_article_number(number: str) -> str:
    """Strip whitespace + trailing dots so ``"1." == "1"`` for lookups.

    Frontmatter authors are inconsistent about the trailing period;
    we treat both forms as the same article so client integrations
    that round-trip the displayed string don't break the next call.
    """
    return number.strip().rstrip(".")


def find_article(law: Law, article_number: str) -> Article | None:
    """Return the article identified by *article_number* within *law*.

    Comparison is normalisation-tolerant on both sides — see
    :func:`_normalise_article_number`. Returns ``None`` when no article
    matches; callers decide whether that maps to a 404, an MCP error
    dict, or something else.
    """
    target = _normalise_article_number(article_number)
    for article in law.articles:
        if _normalise_article_number(article.number) == target:
            return article
    return None
