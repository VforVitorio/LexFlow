"""In-memory full-text search engine.

Provides a simple substring-based search across all laws and articles.
Designed for Phase 1; Phase 7 will introduce semantic search with embeddings.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from lexflow.core.schemas import SearchResponse, SearchResult


@dataclass(frozen=True)
class SearchEntry:
    """A single searchable unit — either a full law or a single article."""

    law_id: str
    law_title: str
    article_number: str | None
    text: str
    text_lower: str  # Pre-lowered for fast matching


@dataclass
class SearchIndex:
    """Inverted index for full-text search across laws and articles."""

    _entries: list[SearchEntry] = field(default_factory=list)
    _built: bool = False

    @property
    def is_built(self) -> bool:
        """Whether the index has been populated."""
        return self._built

    @property
    def entry_count(self) -> int:
        """Total number of searchable entries."""
        return len(self._entries)

    def add_entry(
        self,
        law_id: str,
        law_title: str,
        article_number: str | None,
        text: str,
    ) -> None:
        """Add a single searchable entry to the index."""
        self._entries.append(
            SearchEntry(
                law_id=law_id,
                law_title=law_title,
                article_number=article_number,
                text=text,
                text_lower=text.lower(),
            )
        )

    def mark_built(self) -> None:
        """Signal that index construction is complete."""
        self._built = True

    def to_dict(self) -> dict[str, list[dict[str, str | None]]]:
        """Serialize entries for disk caching (see core/search_cache.py).

        ``text_lower`` is intentionally dropped — it's pure derived data and
        storing it would roughly double the file size. :meth:`from_dict`
        recomputes it via :meth:`add_entry`.
        """
        return {
            "entries": [
                {
                    "law_id": entry.law_id,
                    "law_title": entry.law_title,
                    "article_number": entry.article_number,
                    "text": entry.text,
                }
                for entry in self._entries
            ]
        }

    @classmethod
    def from_dict(cls, data: dict[str, list[dict[str, str | None]]]) -> SearchIndex:
        """Rebuild an index from :meth:`to_dict` output, marked as built."""
        index = cls()
        for raw in data["entries"]:
            index.add_entry(
                law_id=raw["law_id"] or "",
                law_title=raw["law_title"] or "",
                article_number=raw["article_number"],
                text=raw["text"] or "",
            )
        index.mark_built()
        return index

    def search(
        self,
        query: str,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> SearchResponse:
        """Search for *query* across all indexed entries.

        Returns results sorted by relevance (title matches score higher).
        """
        query_lower = query.lower()
        scored: list[tuple[float, SearchEntry]] = []

        for entry in self._entries:
            score = _score_entry(entry, query_lower)
            if score > 0:
                scored.append((score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)

        total = len(scored)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = scored[start:end]

        results = [_build_result(entry, query, score) for score, entry in page_items]

        return SearchResponse(
            query=query,
            total=total,
            items=results,
            page=page,
            page_size=page_size,
        )


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

_TITLE_BOOST = 3.0


def _score_entry(entry: SearchEntry, query_lower: str) -> float:
    """Calculate a simple relevance score for *entry* against *query_lower*.

    Scoring:
    - Count occurrences of the query in the text (case-insensitive)
    - Boost matches that appear in the law title
    """
    count = entry.text_lower.count(query_lower)
    if count == 0:
        return 0.0

    score = float(count)

    # Title boost
    if query_lower in entry.law_title.lower():
        score *= _TITLE_BOOST

    return score


def _build_result(entry: SearchEntry, query: str, score: float) -> SearchResult:
    """Assemble a :class:`SearchResult` for one scored entry.

    Computes the snippet and locates the query inside it so the frontend can
    visually highlight the match without re-scanning. The offsets are into
    the final ``snippet`` string (after ellipsis prepend + whitespace
    collapse), not the source text.
    """
    snippet = _extract_snippet(entry.text, query)
    match = _locate_match(snippet, query)
    match_start, match_end = match if match is not None else (None, None)
    return SearchResult(
        law_id=entry.law_id,
        law_title=entry.law_title,
        article_number=entry.article_number,
        snippet=snippet,
        match_start=match_start,
        match_end=match_end,
        score=score,
    )


def _extract_snippet(text: str, query: str, context_chars: int = 150) -> str:
    """Extract a text snippet around the first occurrence of *query*.

    Returns up to *context_chars* characters of context on each side of the
    match.
    """
    idx = text.lower().find(query.lower())
    if idx == -1:
        return text[: context_chars * 2] if text else ""

    start = max(0, idx - context_chars)
    end = min(len(text), idx + len(query) + context_chars)
    snippet = text[start:end].strip()

    # Clean up partial words at boundaries
    if start > 0:
        snippet = "..." + snippet.lstrip()
        space = snippet.find(" ", 4)
        if space != -1:
            snippet = "..." + snippet[space + 1 :]

    if end < len(text):
        last_space = snippet.rfind(" ")
        snippet = snippet[:last_space] + "..." if last_space > len(snippet) - 20 else snippet + "..."

    # Collapse whitespace
    snippet = re.sub(r"\s+", " ", snippet)
    return snippet


def _locate_match(snippet: str, query: str) -> tuple[int, int] | None:
    """Find the first case-insensitive occurrence of *query* in *snippet*.

    Returns ``(start, end)`` character offsets into ``snippet``, or ``None``
    when the query was eliminated by the snippet's trim/ellipsis pass — that
    happens when the corpus match was outside the kept window or when the
    only match lived in the law title (which isn't part of the snippet).
    """
    if not query or not snippet:
        return None
    idx = snippet.lower().find(query.lower())
    if idx == -1:
        return None
    return idx, idx + len(query)
