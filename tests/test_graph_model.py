"""Unit tests for the LegalGraph model and builder."""

from __future__ import annotations

from pathlib import Path

from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.models import LawMetadata
from lexflow.core.registry import LawRegistry
from lexflow.graph.algorithms import pagerank, top_laws
from lexflow.graph.builder import build_graph
from lexflow.graph.model import LegalGraph


def _law(graph: LegalGraph, law_id: str, title: str) -> None:
    graph.add_law(LawMetadata(identifier=law_id, title=title, rank=LawRank.LEY, status=LawStatus.IN_FORCE))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _registry_from_fixture(sample_law_dir: Path) -> LawRegistry:
    """Build a LawRegistry backed by the sample_law_dir fixture."""
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    return registry


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_build_graph_has_nodes(sample_law_dir: Path) -> None:
    registry = _registry_from_fixture(sample_law_dir)
    graph = build_graph(registry)
    assert graph.node_count() > 0


def test_law_node_has_attributes(sample_law_dir: Path) -> None:
    registry = _registry_from_fixture(sample_law_dir)
    graph = build_graph(registry)
    first_id = registry.law_ids[0]
    node_data = graph.graph.nodes[first_id]
    assert "title" in node_data
    assert "rank" in node_data
    assert "status" in node_data


def test_add_reference_creates_edge(sample_law_dir: Path) -> None:
    graph = LegalGraph()
    registry = _registry_from_fixture(sample_law_dir)
    ids = registry.law_ids[:2]
    graph.add_law(registry.get_metadata(ids[0]))
    graph.add_law(registry.get_metadata(ids[1]))
    graph.add_reference(ids[0], ids[1])
    assert graph.edge_count() == 1
    assert ids[1] in graph.get_neighbors(ids[0])


def test_get_neighbors_unknown_law_returns_empty() -> None:
    graph = LegalGraph()
    assert graph.get_neighbors("NONEXISTENT-LAW") == []


def test_pagerank_scores_between_0_and_1(sample_law_dir: Path) -> None:
    registry = _registry_from_fixture(sample_law_dir)
    graph = build_graph(registry)
    scores = pagerank(graph)
    if scores:
        assert all(0.0 <= v <= 1.0 for v in scores.values())


def test_top_laws_returns_n_items(sample_law_dir: Path) -> None:
    registry = _registry_from_fixture(sample_law_dir)
    graph = build_graph(registry)
    top = top_laws(graph, n=5)
    assert len(top) <= 5


def test_get_subgraph_contains_seed(sample_law_dir: Path) -> None:
    registry = _registry_from_fixture(sample_law_dir)
    graph = build_graph(registry)
    seed = registry.law_ids[0]
    sub = graph.get_subgraph(seed, depth=1)
    assert seed in sub.nodes


def test_get_subgraph_caps_hub_neighbourhood() -> None:
    # A hub cited by many laws must not return a hairball (#569).
    graph = LegalGraph()
    _law(graph, "HUB", "Ley 1/2000")
    for i in range(20):
        _law(graph, f"L{i}", f"Ley {i}/2001")
        graph.add_reference(f"L{i}", "HUB")
    sub = graph.get_subgraph("HUB", depth=1, max_nodes=5)
    assert "HUB" in sub.nodes
    assert sub.number_of_nodes() == 5  # seed + 4 neighbours, capped


def test_get_subgraph_cap_keeps_highest_degree() -> None:
    graph = LegalGraph()
    for nid, title in [("SEED", "Ley 1/2000"), ("HI", "Ley 2/2000"), ("LO", "Ley 3/2000"), ("X", "Ley 4/2000")]:
        _law(graph, nid, title)
    graph.add_reference("SEED", "HI")
    graph.add_reference("SEED", "LO")
    graph.add_reference("HI", "X")  # HI has degree 2, LO degree 1
    sub = graph.get_subgraph("SEED", depth=1, max_nodes=2)
    assert set(sub.nodes) == {"SEED", "HI"}  # higher-degree neighbour wins the single slot
