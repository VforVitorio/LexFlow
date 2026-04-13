"""Legal knowledge graph backed by NetworkX DiGraph."""

from __future__ import annotations

from functools import lru_cache

import networkx as nx

from lexflow.core.models import LawMetadata


class LegalGraph:
    def __init__(self) -> None:
        self._g: nx.DiGraph = nx.DiGraph()

    def add_law(self, metadata: LawMetadata) -> None:
        """Add a law node with its metadata as attributes."""
        self._g.add_node(
            metadata.identifier,
            title=metadata.title,
            rank=metadata.rank.value,
            status=metadata.status.value,
            jurisdiction=metadata.jurisdiction.value if metadata.jurisdiction else None,
            publication_date=str(metadata.publication_date) if metadata.publication_date else None,
        )

    def add_reference(
        self,
        source_id: str,
        target_id: str,
        *,
        source_article: str | None = None,
        reference_text: str = "",
    ) -> None:
        """Add a directed edge from source to target law."""
        if source_id in self._g and target_id in self._g:
            self._g.add_edge(source_id, target_id, source_article=source_article, reference_text=reference_text)

    def get_neighbors(self, law_id: str) -> list[str]:
        """Return IDs of laws that this law references (successors)."""
        if law_id not in self._g:
            return []
        return list(self._g.successors(law_id))

    def get_subgraph(self, law_id: str, depth: int = 1) -> nx.DiGraph:
        """Return subgraph of laws reachable from law_id within depth hops."""
        nodes = {law_id}
        frontier = {law_id}
        for _ in range(depth):
            next_frontier: set[str] = set()
            for node in frontier:
                next_frontier.update(self._g.successors(node))
                next_frontier.update(self._g.predecessors(node))
            frontier = next_frontier - nodes
            nodes.update(frontier)
        return self._g.subgraph(nodes).copy()

    def node_count(self) -> int:
        return int(self._g.number_of_nodes())

    def edge_count(self) -> int:
        return int(self._g.number_of_edges())

    @property
    def graph(self) -> nx.DiGraph:
        return self._g


@lru_cache(maxsize=1)
def get_graph() -> LegalGraph:
    """Singleton LegalGraph built from the registry."""
    from lexflow.core.registry import get_registry
    from lexflow.graph.builder import build_graph

    return build_graph(get_registry())
