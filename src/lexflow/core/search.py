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

        results = [
            SearchResult(
                law_id=entry.law_id,
                law_title=entry.law_title,
                article_number=entry.article_number,
                snippet=_extract_snippet(entry.text, query),
                score=score,
            )
            for score, entry in page_items
        ]

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
