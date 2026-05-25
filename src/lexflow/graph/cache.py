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
    # ``check_output`` raises ``CalledProcessError`` on non-zero exit and
    # ``FileNotFoundError`` (subclass of ``OSError``) when git is missing.
    # We never want this helper to crash the request — degrade to a
    # sentinel so ``load_or_build`` can decide what to do.
    except (subprocess.CalledProcessError, OSError):
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
    # Bad cache file = treat as missing. ``OSError`` for file reads,
    # ``json.JSONDecodeError`` (a ValueError) for parse, ``KeyError`` if
    # the schema drifted from CACHE_VERSION, ``TypeError`` for shape
    # mismatches inside ``node_link_graph``.
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Could not load graph cache: %s", exc)
        return None


def load_or_build(registry: LawRegistry, data_path: Path) -> LegalGraph:
    cache_path = data_path.parent / "graph_cache.json"
    current_hash = _submodule_hash(data_path)
    # If we cannot identify the data revision (no git checkout, missing
    # submodule), treat the cache as stale to avoid serving a graph that
    # never invalidates. Equality on "unknown" would otherwise lock the
    # cache permanently.
    if current_hash == "unknown":
        logger.info("Rebuilding graph (data revision unknown — cache bypassed)")
        graph = build_graph(registry)
        save_graph(graph, cache_path, current_hash)
        return graph
    cached = load_graph(cache_path)
    if cached is not None:
        graph, cached_hash = cached
        if cached_hash == current_hash and cached_hash != "unknown":
            logger.info("Graph loaded from cache (%d nodes)", graph.node_count())
            return graph
    logger.info("Rebuilding graph (hash mismatch or no cache)")
    graph = build_graph(registry)
    save_graph(graph, cache_path, current_hash)
    return graph
