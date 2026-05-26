"""Legal knowledge graph backed by NetworkX DiGraph.

The process-wide :class:`LegalGraph` singleton lives in
:func:`lexflow.api.dependencies.get_graph` (issue #101). Don't add a
top-level ``get_graph`` here — that's the third copy of the same idea
the audit found and removed.
"""

from __future__ import annotations

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
    ) -> bool:
        """Add a directed edge from source to target law.

        Returns True if the edge was added, False if either endpoint is not
        a known node. Returning a flag lets callers keep accurate counters
        instead of guessing from `edge_count()` deltas.
        """
        if source_id not in self._g or target_id not in self._g:
            return False
        self._g.add_edge(source_id, target_id, source_article=source_article, reference_text=reference_text)
        return True

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


