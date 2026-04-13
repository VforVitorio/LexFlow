"""LegalGraph — in-memory knowledge graph for Spanish legislation."""
from __future__ import annotations

import networkx as nx


class LegalGraph:
    """Wrapper around a NetworkX DiGraph representing legal document relationships."""

    def __init__(self) -> None:
        self._g: nx.DiGraph = nx.DiGraph()

    @property
    def graph(self) -> nx.DiGraph:
        """Return the underlying NetworkX DiGraph."""
        return self._g

    def add_law(self, law_id: str, **attrs: object) -> None:
        """Add a law node with optional attributes (title, date, …)."""
        self._g.add_node(law_id, **attrs)

    def add_reference(self, src: str, dst: str, **attrs: object) -> None:
        """Add a directed edge representing a legal reference from *src* to *dst*."""
        self._g.add_edge(src, dst, **attrs)

    def get_subgraph(self, center_id: str, depth: int = 1) -> nx.DiGraph:
        """Return the ego-subgraph around *center_id* up to *depth* hops.

        Args:
            center_id: The law identifier to centre the view on.
            depth: Number of hops out to include.

        Returns:
            A DiGraph subgraph (view or copy).
        """
        if center_id not in self._g:
            return nx.DiGraph()
        undirected = self._g.to_undirected()
        ego = nx.ego_graph(undirected, center_id, radius=depth)
        return nx.DiGraph(self._g.subgraph(ego.nodes()))
