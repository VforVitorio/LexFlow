"""Disk cache for the semantic index, invalidated by corpus revision + embedder.

Re-embedding the whole corpus on every restart is cheap for ``HashEmbedder``
but expensive for a real model (minutes for ~12 K articles). This persists
the built matrix + records, keyed by BOTH the legalize-es revision and the
embedder identity, so either a corpus update or an embedder/model switch
forces a rebuild. Mirrors the shape of ``graph/cache.py``.

Layout (under ``<config_dir>/index/``):

* ``vectors.npy``    — float32 ``(N, D)`` matrix, L2-normalised rows.
* ``index_meta.json`` — ``version``, ``corpus_hash``, ``embedder_id``,
  ``dimension`` and the per-row ``records`` (law id, article, snippet).

The vectors go to a binary ``.npy`` rather than JSON: a 12 K x 384 float
matrix is ~18 MB binary but balloons to 5x+ as a JSON number list, and the
parse cost dominates load time.

--- WHERE TO CHANGE IF X CHANGES ---
* Cache key inputs   → ``corpus_hash`` (``core/corpus_revision.py``) +
                       ``embedder_id`` (``Embedder.identity``).
* Stored shape       → bump :data:`CACHE_VERSION` so old caches rebuild.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, cast

import numpy as np

from lexflow.core.corpus_revision import UNKNOWN_REVISION, submodule_hash
from lexflow.core.registry import LawRegistry
from lexflow.search.semantic_index import IndexRecord, SemanticIndex

logger = logging.getLogger(__name__)

# Bump when the on-disk shape changes so older caches rebuild on upgrade.
CACHE_VERSION = "1"
_VECTORS_FILE = "vectors.npy"
_META_FILE = "index_meta.json"


def load_or_build(index: SemanticIndex, registry: LawRegistry, data_path: Path, cache_dir: Path) -> None:
    """Hydrate ``index`` from disk if a matching cache exists, else build + save.

    The cache is keyed by the corpus revision and the embedder identity.
    When the revision is unknown (no git checkout / missing submodule) we
    bypass the cache entirely — a cache that never invalidates would serve
    a stale index forever. Mirrors ``graph/cache.load_or_build``.
    """
    corpus_hash = submodule_hash(data_path)
    embedder_id = index.embedder_identity

    if corpus_hash != UNKNOWN_REVISION:
        restored = load_index(index, cache_dir, expected_hash=corpus_hash, expected_embedder=embedder_id)
        if restored:
            logger.info("Semantic index loaded from cache (%d rows)", index.row_count)
            return

    index.build(registry)

    if corpus_hash != UNKNOWN_REVISION:
        save_index(index, cache_dir, corpus_hash=corpus_hash, embedder_id=embedder_id)


def save_index(index: SemanticIndex, cache_dir: Path, *, corpus_hash: str, embedder_id: str) -> None:
    """Persist the built index's vectors + records under ``cache_dir``."""
    vectors, records = index.snapshot()
    cache_dir.mkdir(parents=True, exist_ok=True)
    np.save(cache_dir / _VECTORS_FILE, vectors)
    meta = {
        "version": CACHE_VERSION,
        "corpus_hash": corpus_hash,
        "embedder_id": embedder_id,
        "dimension": int(vectors.shape[1]) if vectors.ndim == 2 else 0,
        "records": [{"law_id": r.law_id, "article_number": r.article_number, "snippet": r.snippet} for r in records],
    }
    # Always utf-8: the snippets carry Spanish legal text (accents, «», the
    # "…" truncation marker). ``Path.write_text`` defaults to the locale
    # encoding (cp1252 on Windows), which raises UnicodeEncodeError on chars
    # outside that codepage — pin utf-8 for both write and read.
    (cache_dir / _META_FILE).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    logger.info("Semantic index cache saved to %s (%d rows)", cache_dir, len(records))


def load_index(index: SemanticIndex, cache_dir: Path, *, expected_hash: str, expected_embedder: str) -> bool:
    """Populate ``index`` from ``cache_dir`` if the cache is valid + matching.

    Returns ``True`` on a successful hydrate, ``False`` when the cache is
    absent, corrupt, or keyed to a different corpus revision / embedder /
    schema version (the caller then rebuilds).
    """
    vectors_path = cache_dir / _VECTORS_FILE
    meta_path = cache_dir / _META_FILE
    if not vectors_path.exists() or not meta_path.exists():
        return False
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if not _meta_matches(meta, expected_hash=expected_hash, expected_embedder=expected_embedder):
            return False
        vectors = cast(np.ndarray, np.load(vectors_path))
        records = [
            IndexRecord(law_id=r["law_id"], article_number=r["article_number"], snippet=r["snippet"])
            for r in meta["records"]
        ]
    # Corrupt / drifted cache = treat as missing. ``OSError`` for reads,
    # ``ValueError`` (incl. ``json.JSONDecodeError``) for parse, ``KeyError``
    # if the schema drifted, ``TypeError`` for a malformed records shape.
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Could not load semantic index cache: %s", exc)
        return False
    if vectors.shape[0] != len(records):
        logger.warning(
            "Semantic index cache row mismatch (%d vectors, %d records); rebuilding", vectors.shape[0], len(records)
        )
        return False
    index.hydrate(vectors, records)
    return True


def _meta_matches(meta: dict[str, Any], *, expected_hash: str, expected_embedder: str) -> bool:
    """Validate the cache metadata against the current corpus + embedder."""
    if meta.get("version") != CACHE_VERSION:
        return False
    if meta.get("corpus_hash") != expected_hash:
        return False
    if meta.get("embedder_id") != expected_embedder:
        return False
    return isinstance(meta.get("records"), list)
