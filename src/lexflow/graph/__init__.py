"""Interactive legal knowledge graph — nodes, edges, queries and visualization."""

from lexflow.graph.algorithms import pagerank, shortest_path, top_laws
from lexflow.graph.builder import build_graph
from lexflow.graph.model import LegalGraph

# Issue #101 — the process-wide singleton lives in
# ``lexflow.api.dependencies.get_graph`` (DI provider). The
# ``functools.lru_cache`` version that lived here was removed because
# nothing imported it after the API layer adopted the DI provider.
__all__ = ["LegalGraph", "build_graph", "pagerank", "shortest_path", "top_laws"]
