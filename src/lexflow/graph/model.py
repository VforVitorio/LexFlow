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

    @classmethod
    def from_networkx(cls, graph: nx.DiGraph) -> LegalGraph:
        """Build a `LegalGraph` around an existing DiGraph.

        Used by the cache loader (#104 #5) so it doesn't have to poke at
        the private ``_g`` attribute. The graph is taken by reference —
        callers are expected to surrender ownership.
        """
        instance = cls()
        instance._g = graph
        return instance

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

    # ------------------------------------------------------------------
    # Incremental update primitives (#230)
    #
    # ``apply_diff_to_graph`` in graph/builder.py drives these; the model
    # stays storage-only. The dangling index lets an added law resolve its
    # incoming edges without rescanning the whole corpus.
    # ------------------------------------------------------------------

    @property
    def dangling(self) -> dict[str, list[dict[str, str | None]]]:
        """Unresolved references waiting on an absent target law.

        ``target_id -> [{"source", "source_article", "reference_text"}]``.
        Stored on the NetworkX ``graph`` dict so it round-trips through the
        on-disk cache (``node_link_data``) for free. A reference whose target
        wasn't a node when the edge was built is parked here so a later
        incremental add can resolve the incoming edge cheaply.
        """
        index: dict[str, list[dict[str, str | None]]] = self._g.graph.setdefault("dangling", {})
        return index

    def remove_law(self, law_id: str) -> None:
        """Remove a law node and all its in/out edges. No-op if absent."""
        if law_id in self._g:
            self._g.remove_node(law_id)

    def clear_outgoing(self, law_id: str) -> None:
        """Remove every outgoing edge from *law_id*; incoming edges kept."""
        if law_id in self._g:
            for target in list(self._g.successors(law_id)):
                self._g.remove_edge(law_id, target)

    def incoming_edges(self, law_id: str) -> list[tuple[str, dict[str, str | None]]]:
        """Predecessors of *law_id* paired with their edge attributes."""
        if law_id not in self._g:
            return []
        return [(pred, dict(self._g[pred][law_id])) for pred in self._g.predecessors(law_id)]

    def add_dangling(self, target_id: str, source_id: str, *, source_article: str | None, reference_text: str) -> None:
        """Park an unresolved reference from *source_id* to absent *target_id*."""
        self.dangling.setdefault(target_id, []).append(
            {"source": source_id, "source_article": source_article, "reference_text": reference_text}
        )

    def pop_dangling(self, target_id: str) -> list[dict[str, str | None]]:
        """Remove and return the references that were waiting on *target_id*."""
        return self.dangling.pop(target_id, [])

    def drop_source_from_dangling(self, source_id: str) -> None:
        """Forget every dangling reference originating from *source_id*."""
        for target_id in list(self.dangling):
            kept = [d for d in self.dangling[target_id] if d["source"] != source_id]
            if kept:
                self.dangling[target_id] = kept
            else:
                del self.dangling[target_id]

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
