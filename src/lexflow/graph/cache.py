"""Graph cache: serialize/deserialize LegalGraph to JSON with hash-based invalidation."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import networkx as nx

from lexflow.core.corpus_revision import UNKNOWN_REVISION, submodule_hash
from lexflow.core.registry import LawRegistry
from lexflow.graph.builder import build_graph
from lexflow.graph.model import LegalGraph

logger = logging.getLogger(__name__)
# v2 adds the dangling-reference index to the payload (#230). Older caches
# lack it, so bumping forces one rebuild on upgrade to populate it.
CACHE_VERSION = "2"


def save_graph(graph: LegalGraph, cache_path: Path, data_hash: str) -> None:
    data = {
        "version": CACHE_VERSION,
        "hash": data_hash,
        "graph": nx.node_link_data(graph.graph),
    }
    cache_path.write_text(json.dumps(data))
    logger.info("Graph cache saved to %s", cache_path)


def load_graph(cache_path: Path) -> tuple[LegalGraph, str] | None:
    if not cache_path.exists():
        return None
    try:
        data = json.loads(cache_path.read_text())
        if data.get("version") != CACHE_VERSION:
            return None
        g = nx.node_link_graph(data["graph"], directed=True)
        graph = LegalGraph.from_networkx(g)
        return graph, data["hash"]
    # Bad cache file = treat as missing. ``OSError`` for file reads,
    # ``json.JSONDecodeError`` (a ValueError) for parse, ``KeyError`` if
    # the schema drifted from CACHE_VERSION, ``TypeError`` for shape
    # mismatches inside ``node_link_graph``.
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Could not load graph cache: %s", exc)
        return None


def load_or_build(registry: LawRegistry, data_path: Path) -> LegalGraph:
    cache_path = data_path.parent / "graph_cache.json"
    current_hash = submodule_hash(data_path)
    # If we cannot identify the data revision (no git checkout, missing
    # submodule), treat the cache as stale to avoid serving a graph that
    # never invalidates. Equality on "unknown" would otherwise lock the
    # cache permanently.
    if current_hash == UNKNOWN_REVISION:
        logger.info("Rebuilding graph (data revision unknown — cache bypassed)")
        graph = build_graph(registry)
        save_graph(graph, cache_path, current_hash)
        return graph
    cached = load_graph(cache_path)
    if cached is not None:
        graph, cached_hash = cached
        if cached_hash == current_hash and cached_hash != UNKNOWN_REVISION:
            logger.info("Graph loaded from cache (%d nodes)", graph.node_count())
            return graph
    logger.info("Rebuilding graph (hash mismatch or no cache)")
    graph = build_graph(registry)
    save_graph(graph, cache_path, current_hash)
    return graph
