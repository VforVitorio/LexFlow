"""In-memory registry of parsed laws.

The :class:`LawRegistry` is a singleton that indexes all law files on disk,
lazily parses them on first access, and caches results permanently.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from threading import Lock

from lexflow.core.enums import LawRank, LawStatus, Scope
from lexflow.core.exceptions import DataPathError, LawNotFoundError
from lexflow.core.metadata_parser import parse_metadata_only
from lexflow.core.models import Law, LawMetadata
from lexflow.core.parser import parse_law_file
from lexflow.core.schemas import LawSummary, PaginatedResponse, SearchResponse
from lexflow.core.search import SearchIndex
from lexflow.utils.config import get_settings
from lexflow.utils.file_discovery import law_id_from_path, list_law_files

logger = logging.getLogger(__name__)


class LawRegistry:
    """Indexed collection of all parsed laws.

    The index (identifier -> file path) is built eagerly on instantiation
    by scanning filenames — this is fast (<1 s for 12 K files).  Individual
    law files are only parsed when first requested via :meth:`get_law`.
    """

    def __init__(self, data_path: Path) -> None:
        self._data_path = data_path
        self._index: dict[str, Path] = {}
        self._cache: dict[str, Law] = {}
        self._metadata_cache: dict[str, LawMetadata] = {}
        self._search_index = SearchIndex()
        self._lock = Lock()
        self._build_index()

    # ------------------------------------------------------------------
    # Index construction
    # ------------------------------------------------------------------

    def _build_index(self) -> None:
        """Scan the data directory for all law files and build the id -> path mapping."""
        if not self._data_path.is_dir():
            raise DataPathError(str(self._data_path))

        files = list_law_files(self._data_path)
        for path in files:
            law_id = law_id_from_path(path)
            self._index[law_id] = path

        logger.info("Law index built: %d files in %s", len(self._index), self._data_path)

    # ------------------------------------------------------------------
    # Lazy parse + cache
    # ------------------------------------------------------------------

    def _ensure_parsed(self, law_id: str) -> Law:
        """Parse a law file and store it in the cache.  Thread-safe."""
        if law_id in self._cache:
            return self._cache[law_id]

        with self._lock:
            # Double-check after acquiring lock
            if law_id in self._cache:
                return self._cache[law_id]

            path = self._index.get(law_id)
            if path is None:
                raise LawNotFoundError(law_id)

            law = parse_law_file(path)
            self._cache[law_id] = law
            return law

    def _ensure_metadata(self, law_id: str) -> LawMetadata:
        """Get metadata for a law, using the fast frontmatter-only parser."""
        if law_id in self._metadata_cache:
            return self._metadata_cache[law_id]

        # If fully parsed, use that
        if law_id in self._cache:
            return self._cache[law_id].metadata

        path = self._index.get(law_id)
        if path is None:
            raise LawNotFoundError(law_id)

        metadata = parse_metadata_only(path)
        self._metadata_cache[law_id] = metadata
        return metadata

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def law_ids(self) -> list[str]:
        """All known law identifiers, sorted."""
        return sorted(self._index)

    @property
    def total_count(self) -> int:
        """Total number of laws in the index."""
        return len(self._index)

    def get_law(self, law_id: str) -> Law:
        """Get a fully parsed law by identifier.

        Raises :class:`~lexflow.core.exceptions.LawNotFoundError` if not found.
        """
        return self._ensure_parsed(law_id)

    def get_metadata(self, law_id: str) -> LawMetadata:
        """Get just the metadata for a law (faster than full parse)."""
        return self._ensure_metadata(law_id)

    def list_laws(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        rank: LawRank | None = None,
        status: LawStatus | None = None,
        scope: Scope | None = None,
        jurisdiction: str | None = None,
    ) -> PaginatedResponse[LawSummary]:
        """Return a paginated, optionally filtered list of law summaries."""
        summaries = self._build_summaries()
        filtered = _apply_filters(summaries, rank=rank, status=status, scope=scope, jurisdiction=jurisdiction)
        return _paginate(filtered, page=page, page_size=page_size)

    def search_text(
        self,
        query: str,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> SearchResponse:
        """Full-text search across all laws.

        Builds the search index lazily on first call from all cached laws
        and metadata.
        """
        if not self._search_index.is_built:
            self._build_search_index()
        return self._search_index.search(query, page=page, page_size=page_size)

    def preload_all_metadata(self) -> None:
        """Parse frontmatter for all laws in the index.

        Called as a background task at startup to make subsequent list/filter
        operations fast.
        """
        loaded = 0
        for law_id in self._index:
            if law_id not in self._metadata_cache:
                try:
                    self._ensure_metadata(law_id)
                    loaded += 1
                except Exception:
                    logger.warning("Failed to preload metadata for %s", law_id, exc_info=True)
        logger.info("Metadata preload complete: %d laws loaded", loaded)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_summaries(self) -> list[LawSummary]:
        """Build LawSummary objects for all indexed laws."""
        summaries: list[LawSummary] = []
        for law_id in sorted(self._index):
            meta = self._ensure_metadata(law_id)
            article_count = self._cache[law_id].article_count if law_id in self._cache else 0
            summaries.append(
                LawSummary(
                    identifier=meta.identifier,
                    title=meta.title,
                    rank=meta.rank,
                    status=meta.status,
                    publication_date=meta.publication_date,
                    article_count=article_count,
                    scope=meta.scope,
                    jurisdiction=meta.jurisdiction.value if meta.jurisdiction else None,
                )
            )
        return summaries

    def _build_search_index(self) -> None:
        """Build the search index from all metadata and cached law content."""
        for law_id in sorted(self._index):
            meta = self._ensure_metadata(law_id)
            # Add law-level entry (title is the primary searchable text)
            self._search_index.add_entry(
                law_id=meta.identifier,
                law_title=meta.title,
                article_number=None,
                text=meta.title,
            )
            # Add article-level entries if the law has been fully parsed
            if law_id in self._cache:
                law = self._cache[law_id]
                for article in law.articles:
                    self._search_index.add_entry(
                        law_id=meta.identifier,
                        law_title=meta.title,
                        article_number=article.number,
                        text=article.text,
                    )
        self._search_index.mark_built()
        logger.info("Search index built: %d entries", self._search_index.entry_count)


def _apply_filters(
    summaries: list[LawSummary],
    *,
    rank: LawRank | None,
    status: LawStatus | None,
    scope: Scope | None,
    jurisdiction: str | None,
) -> list[LawSummary]:
    """Apply optional filters to a list of summaries."""
    result = summaries
    if rank is not None:
        result = [s for s in result if s.rank == rank]
    if status is not None:
        result = [s for s in result if s.status == status]
    if scope is not None:
        result = [s for s in result if s.scope == scope]
    if jurisdiction is not None:
        result = [s for s in result if s.jurisdiction == jurisdiction]
    return result


def _paginate(items: list[LawSummary], *, page: int, page_size: int) -> PaginatedResponse[LawSummary]:
    """Slice a list into a paginated response."""
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    return PaginatedResponse(
        items=items[start:end],
        total=total,
        page=page,
        page_size=page_size,
    )


@lru_cache(maxsize=1)
def get_registry() -> LawRegistry:
    """Return the singleton :class:`LawRegistry`."""
    settings = get_settings()
    return LawRegistry(settings.data_path)
