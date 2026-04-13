"""Graph algorithms: PageRank, community detection, shortest path."""
from __future__ import annotations

import networkx as nx

from lexflow.graph.model import LegalGraph


def pagerank(graph: LegalGraph, alpha: float = 0.85) -> dict[str, float]:
    """Compute PageRank scores for all law nodes."""
    if graph.node_count() == 0:
        return {}
    return nx.pagerank(graph.graph, alpha=alpha)


def top_laws(graph: LegalGraph, n: int = 10) -> list[tuple[str, float]]:
    """Return top-n laws by PageRank score."""
    scores = pagerank(graph)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)[:n]


def shortest_path(graph: LegalGraph, source: str, target: str) -> list[str]:
    """Return shortest directed path between two laws. Raises nx.NetworkXNoPath if none."""
    return nx.shortest_path(graph.graph, source=source, target=target)


def community_detection(graph: LegalGraph) -> dict[str, int]:
    """Assign community IDs to each law using greedy modularity."""
    undirected = graph.graph.to_undirected()
    communities = nx.community.greedy_modularity_communities(undirected)
    result: dict[str, int] = {}
    for idx, community in enumerate(communities):
        for node in community:
            result[node] = idx
    return result
