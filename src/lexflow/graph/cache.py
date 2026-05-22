"""Graph cache: serialize/deserialize LegalGraph to JSON with hash-based invalidation."""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

import networkx as nx

from lexflow.core.registry import LawRegistry
from lexflow.graph.builder import build_graph
from lexflow.graph.model import LegalGraph

logger = logging.getLogger(__name__)
CACHE_VERSION = "1"


def _submodule_hash(data_path: Path) -> str:
    try:
        result = subprocess.check_output(
            ["git", "-C", str(data_path), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
        )
        return result.decode().strip()
    except Exception:
        return "unknown"


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
        graph = LegalGraph()
        graph._g = g
        return graph, data["hash"]
    except Exception as exc:
        logger.warning("Could not load graph cache: %s", exc)
        return None


def load_or_build(registry: LawRegistry, data_path: Path) -> LegalGraph:
    cache_path = data_path.parent / "graph_cache.json"
    current_hash = _submodule_hash(data_path)
    cached = load_graph(cache_path)
    if cached is not None:
        graph, cached_hash = cached
        if cached_hash == current_hash:
            logger.info("Graph loaded from cache (%d nodes)", graph.node_count())
            return graph
    logger.info("Rebuilding graph (hash mismatch or no cache)")
    graph = build_graph(registry)
    save_graph(graph, cache_path, current_hash)
    return graph
