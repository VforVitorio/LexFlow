"""Search index cache: persist the in-memory ``SearchIndex`` to disk (#231).

Mirrors :mod:`lexflow.core.metadata_cache`. The search index is rebuilt from
metadata on every cold start (10-30 s); persisting it keyed by the legalize-es
submodule commit hash drops warm starts to <1 s. Incremental updates are #230.

Format::

    {"version": "1", "hash": "<commit>", "payload": {"entries": [...]}}
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from lexflow.core.corpus_revision import UNKNOWN_REVISION, submodule_hash
from lexflow.core.search import SearchIndex

if TYPE_CHECKING:
    from lexflow.core.registry import LawRegistry

logger = logging.getLogger(__name__)
# Bump whenever the INDEX BUILDER's output changes, not just the on-disk
# shape: the cache is keyed by corpus revision only, so a logic change that
# doesn't touch the corpus would otherwise keep serving a stale index.
# v2 (#825 review): `registry._index_law_for_search` now also walks sections
# and disposiciones (preambulo, anexo prose), not just articles — a v1 cache
# with a matching corpus hash would load and hide that new content until the
# cache file was deleted by hand.
CACHE_VERSION = "2"
CACHE_FILENAME = "search_index.json"


def save_search_index(index: SearchIndex, cache_path: Path, data_hash: str) -> None:
    """Write the search index to *cache_path* as JSON."""
    data = {"version": CACHE_VERSION, "hash": data_hash, "payload": index.to_dict()}
    cache_path.write_text(json.dumps(data))
    logger.info("Search index cache saved to %s (%d entries)", cache_path, index.entry_count)


def load_search_index(cache_path: Path) -> tuple[SearchIndex, str] | None:
    """Load the search index, or ``None`` if missing/stale/corrupt."""
    if not cache_path.exists():
        return None
    try:
        data = json.loads(cache_path.read_text())
        if data.get("version") != CACHE_VERSION:
            return None
        index = SearchIndex.from_dict(data["payload"])
        return index, data["hash"]
    # Bad cache file = treat as missing. ``OSError`` for reads,
    # ``ValueError`` for JSON parse, ``KeyError`` for schema drift,
    # ``TypeError`` for shape mismatch inside ``from_dict``.
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Could not load search index cache: %s", exc)
        return None


def load_or_build_search(registry: LawRegistry, data_path: Path) -> None:
    """Populate the registry's search index from disk, or build + persist.

    Mirrors :func:`load_or_preload_metadata`. Requires metadata to be present
    already (the index is built from it), so the warm-up runs this *after* the
    metadata stage.
    """
    cache_path = data_path.parent / CACHE_FILENAME
    current_hash = submodule_hash(data_path)
    if current_hash != UNKNOWN_REVISION:
        cached = load_search_index(cache_path)
        if cached is not None:
            index, cached_hash = cached
            if cached_hash == current_hash:
                registry.import_search_index(index)
                logger.info("Search index loaded from cache (%d entries)", index.entry_count)
                return
    logger.info("Building search index (hash mismatch, no cache, or unknown revision)")
    registry.ensure_search_index()
    if current_hash != UNKNOWN_REVISION:
        save_search_index(registry.export_search_index(), cache_path, current_hash)
