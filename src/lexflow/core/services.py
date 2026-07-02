"""Shared business-logic helpers used by both the REST routers and the
MCP tool wrappers (#104 #10 + Sprint 6 rf-8).

Before this module existed, ``articles.py`` had a private ``_find_article``
helper with article-number normalisation (trims whitespace + trailing
dots) and ``mcp_server.get_article`` did a less-forgiving exact match.
Two implementations, one of them subtly buggy. Centralising here keeps
the contract single-sourced; downstream callers stay thin.

Sprint 6 rf-8 also moved the pure ``apply_law_filters`` and
``paginate_summaries`` helpers out of ``core/registry.py`` so the
registry can stay focused on storage and lookup.

--- WHERE TO CHANGE IF X CHANGES ---
* Article number normalisation rules → :func:`_normalise_article_number`.
* Law filter axes (rank/status/scope/jurisdiction) → :func:`apply_law_filters`.
* Pagination shape → :func:`paginate_summaries`.
* New shared lookup → add a function here, NOT a second copy under
  ``api/routers`` or ``chat/mcp_server``.
"""

from __future__ import annotations

from lexflow.core.enums import LawRank, LawStatus, Scope
from lexflow.core.models import Article, Law
from lexflow.core.parser import normalize_tag
from lexflow.core.schemas import LawSummary, PaginatedResponse


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


def apply_law_filters(
    summaries: list[LawSummary],
    *,
    rank: LawRank | None,
    status: LawStatus | None,
    scope: Scope | None,
    jurisdiction: str | None,
    year_from: int | None = None,
    year_to: int | None = None,
    tags: list[str] | None = None,
) -> list[LawSummary]:
    """Apply optional filters to a list of law summaries.

    Pure function: same inputs always give the same output. Lifted out
    of ``LawRegistry`` (Sprint 6 rf-8) so the storage layer doesn't own
    selection logic.

    ``year_from`` / ``year_to`` filter on the publication year (inclusive,
    #563). A law with no ``publication_date`` is excluded whenever either
    year bound is active — it can't satisfy a date range.

    ``tags`` filters by official topic tag (#671) with AND semantics — a
    law is kept only if it carries *every* requested tag. Incoming tags are
    normalised to kebab slugs (``normalize_tag``) so accented / free-spelled
    input (``"Protección"``) matches the stored vocabulary (``proteccion``);
    empty-after-normalisation tags are dropped rather than excluding
    everything.
    """
    # #671: normalise the requested tags once, up front — not per summary.
    required_tags = {slug for t in (tags or []) if (slug := normalize_tag(t))}

    # Audit #409 perf: previously this function ran one full list
    # comprehension per active filter, allocating throw-away lists for
    # each pass. We now build a single predicate that ANDs every
    # active filter and walk ``summaries`` once.
    no_filters = (
        rank is None
        and status is None
        and scope is None
        and jurisdiction is None
        and year_from is None
        and year_to is None
        and not required_tags
    )
    if no_filters:
        return summaries

    def keep(summary: LawSummary) -> bool:
        if rank is not None and summary.rank != rank:
            return False
        if status is not None and summary.status != status:
            return False
        if scope is not None and summary.scope != scope:
            return False
        if jurisdiction is not None and summary.jurisdiction != jurisdiction:
            return False
        if year_from is not None or year_to is not None:
            published = summary.publication_date
            if published is None:
                return False
            if year_from is not None and published.year < year_from:
                return False
            if year_to is not None and published.year > year_to:
                return False
        # Empty ``required_tags`` is vacuously a subset → keeps the law, so no
        # tag filter costs nothing. Non-empty → AND: every requested tag present.
        return required_tags.issubset(summary.tags)

    return [s for s in summaries if keep(s)]


def paginate_summaries(
    items: list[LawSummary],
    *,
    page: int,
    page_size: int,
) -> PaginatedResponse[LawSummary]:
    """Slice a list of law summaries into a paginated response.

    Lifted from ``LawRegistry`` (Sprint 6 rf-8). Page indexing is
    1-based to match the public API; the slice is computed from the
    total length so callers never have to reason about off-by-ones.
    """
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    return PaginatedResponse(
        items=items[start:end],
        total=total,
        page=page,
        page_size=page_size,
    )
