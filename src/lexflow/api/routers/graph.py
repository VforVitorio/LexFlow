"""Graph endpoints for the legal knowledge graph.

The :class:`~lexflow.graph.model.LegalGraph` singleton lives in
:func:`lexflow.api.dependencies.get_graph` so tests can override it with
``app.dependency_overrides[get_graph]`` and the sync router can invalidate
it without reaching into this module's globals.
"""

from __future__ import annotations

from typing import Annotated

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, Query

from lexflow.api.dependencies import get_graph
from lexflow.core.schemas import (
    GraphEdgeData,
    GraphNeighborsResponse,
    GraphNodeData,
    GraphStatsResponse,
    GraphSubgraphResponse,
    GraphTopItem,
)
from lexflow.graph.algorithms import shortest_path, top_laws
from lexflow.graph.model import LegalGraph

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/neighbors/{law_id}", response_model=GraphNeighborsResponse)
def get_neighbors(
    law_id: str,
    graph: Annotated[LegalGraph, Depends(get_graph)],
) -> GraphNeighborsResponse:
    """Return the direct successors (outgoing references) of a law node."""
    neighbors = graph.get_neighbors(law_id)
    return GraphNeighborsResponse(law_id=law_id, neighbors=neighbors, count=len(neighbors))


@router.get("/path", response_model=list[str])
def get_path(
    from_id: Annotated[str, Query(alias="from")],
    to_id: Annotated[str, Query(alias="to")],
    graph: Annotated[LegalGraph, Depends(get_graph)],
) -> list[str]:
    """Return the shortest directed path between two law nodes.

    Query params use the `from` / `to` aliases (matches the convention of
    the versions diff endpoint and the documented example in the README).
    """
    try:
        return shortest_path(graph, from_id, to_id)
    except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/subgraph/{law_id}", response_model=GraphSubgraphResponse)
def get_subgraph(
    law_id: str,
    graph: Annotated[LegalGraph, Depends(get_graph)],
    depth: int = Query(1, ge=1, le=3),
) -> GraphSubgraphResponse:
    """Return the ego-subgraph around a law node up to a given depth.

    Returns 404 if the law id is not a node in the graph — `get_subgraph`
    on `LegalGraph` walks `successors`/`predecessors` which raise
    `NetworkXError` on unknown nodes; we want a controlled response.
    """
    if law_id not in graph.graph:
        raise HTTPException(status_code=404, detail=f"Law id not in graph: {law_id}")
    sub = graph.get_subgraph(law_id, depth=depth)
    pagerank_by_node, community_by_node = _enrich_subgraph(sub)
    nodes = [
        GraphNodeData(
            id=n,
            **{k: v for k, v in sub.nodes[n].items() if k in {"title", "rank", "status"}},
            community=community_by_node.get(n),
            pagerank=pagerank_by_node.get(n),
        )
        for n in sub.nodes
    ]
    edges = [
        GraphEdgeData(source=u, target=v, source_article=sub.edges[u, v].get("source_article")) for u, v in sub.edges
    ]
    return GraphSubgraphResponse(nodes=nodes, edges=edges)


def _enrich_subgraph(sub: nx.DiGraph) -> tuple[dict[str, float], dict[str, int]]:
    """Compute per-node PageRank + community over the *subgraph*.

    Both are scoped to ``sub`` (not the global graph) so they stay
    coherent as the seed/depth change: PageRank sums to ~1 within the
    returned set, and community ids index the clusters visible on screen.

    Returns ``(pagerank_by_node, community_by_node)``. Empty dicts for an
    empty subgraph so the caller's ``.get(n)`` simply yields ``None``.
    """
    if sub.number_of_nodes() == 0:
        return {}, {}
    pagerank_by_node: dict[str, float] = {node: round(score, 6) for node, score in nx.pagerank(sub).items()}
    # greedy_modularity needs an undirected view. Each returned set is one
    # community; index them so the frontend can map id → colour.
    community_by_node: dict[str, int] = {}
    communities = nx.community.greedy_modularity_communities(sub.to_undirected())
    for idx, members in enumerate(communities):
        for node in members:
            community_by_node[node] = idx
    return pagerank_by_node, community_by_node


@router.get("/stats", response_model=GraphStatsResponse)
def get_stats(graph: Annotated[LegalGraph, Depends(get_graph)]) -> GraphStatsResponse:
    """Return high-level statistics about the knowledge graph."""
    g = graph.graph
    return GraphStatsResponse(
        node_count=graph.node_count(),
        edge_count=graph.edge_count(),
        density=round(nx.density(g), 6),
        weakly_connected_components=nx.number_weakly_connected_components(g),
    )


@router.get("/top", response_model=list[GraphTopItem])
def get_top(
    graph: Annotated[LegalGraph, Depends(get_graph)],
    limit: int = Query(10, ge=1, le=100),
    metric: str = Query("pagerank", pattern="^pagerank$"),
) -> list[GraphTopItem]:
    """Return the top-`limit` most referenced laws by `metric` (PageRank only).

    `metric` accepts `pagerank` today; new metrics will extend the pattern.
    Param names match the README example (`?metric=pagerank&limit=20`).
    """
    del metric  # Only one metric supported today; declared for the public contract.
    items = top_laws(graph, n=limit)
    g = graph.graph
    return [
        GraphTopItem(law_id=law_id, score=round(score, 6), title=g.nodes[law_id].get("title"))
        for law_id, score in items
    ]
