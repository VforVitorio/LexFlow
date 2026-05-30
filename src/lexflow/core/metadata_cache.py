"""Metadata cache: persist preloaded ``LawMetadata`` to disk (#231).

Mirrors :mod:`lexflow.graph.cache` so warm starts skip the 10-30 s frontmatter
re-parse of ~12 K laws. The cache is a single JSON file keyed by the legalize-es
submodule commit hash; a corpus update invalidates it wholesale (incremental
delta updates are #230).

Format::

    {"version": "1", "hash": "<commit>", "payload": {law_id: <LawMetadata json>}}
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from lexflow.core.corpus_revision import UNKNOWN_REVISION, submodule_hash
from lexflow.core.models import LawMetadata

if TYPE_CHECKING:
    from lexflow.core.registry import LawRegistry

logger = logging.getLogger(__name__)
CACHE_VERSION = "1"
CACHE_FILENAME = "metadata_cache.json"


def save_metadata_cache(metadata: dict[str, LawMetadata], cache_path: Path, data_hash: str) -> None:
    """Write the metadata snapshot to *cache_path* as JSON."""
    payload = {law_id: meta.model_dump(mode="json") for law_id, meta in metadata.items()}
    data = {"version": CACHE_VERSION, "hash": data_hash, "payload": payload}
    cache_path.write_text(json.dumps(data))
    logger.info("Metadata cache saved to %s (%d laws)", cache_path, len(payload))


def load_metadata_cache(cache_path: Path) -> tuple[dict[str, LawMetadata], str] | None:
    """Load the metadata snapshot, or ``None`` if missing/stale/corrupt."""
    if not cache_path.exists():
        return None
    try:
        data = json.loads(cache_path.read_text())
        if data.get("version") != CACHE_VERSION:
            return None
        payload = data["payload"]
        metadata = {law_id: LawMetadata.model_validate(raw) for law_id, raw in payload.items()}
        return metadata, data["hash"]
    # Bad cache file = treat as missing. ``OSError`` for reads,
    # ``ValueError`` for JSON parse + pydantic validation, ``KeyError`` if
    # the schema drifted from CACHE_VERSION, ``TypeError`` for shape mismatch.
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Could not load metadata cache: %s", exc)
        return None


def load_or_preload_metadata(registry: LawRegistry, data_path: Path) -> None:
    """Populate registry metadata from the disk cache, or preload + persist.

    Mirrors :func:`lexflow.graph.cache.load_or_build`: a known revision with a
    matching cache loads in <1 s; any miss falls back to the full preload and
    rewrites the cache. An ``unknown`` revision bypasses the cache entirely so
    it can never lock onto a stale snapshot.
    """
    cache_path = data_path.parent / CACHE_FILENAME
    current_hash = submodule_hash(data_path)
    if current_hash != UNKNOWN_REVISION:
        cached = load_metadata_cache(cache_path)
        if cached is not None:
            metadata, cached_hash = cached
            if cached_hash == current_hash:
                registry.import_metadata(metadata)
                logger.info("Metadata loaded from cache (%d laws)", len(metadata))
                return
    logger.info("Preloading metadata (hash mismatch, no cache, or unknown revision)")
    registry.preload_all_metadata()
    if current_hash != UNKNOWN_REVISION:
        save_metadata_cache(registry.export_metadata(), cache_path, current_hash)
