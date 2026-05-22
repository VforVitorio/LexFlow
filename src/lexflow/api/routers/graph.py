"""Graph endpoints for the legal knowledge graph."""

from __future__ import annotations

from typing import Annotated

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, Query

from lexflow.api.dependencies import get_law_registry
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import (
    GraphEdgeData,
    GraphNeighborsResponse,
    GraphNodeData,
    GraphStatsResponse,
    GraphSubgraphResponse,
    GraphTopItem,
)
from lexflow.graph.algorithms import shortest_path, top_laws
from lexflow.graph.builder import build_graph
from lexflow.graph.model import LegalGraph

router = APIRouter(prefix="/graph", tags=["graph"])

_cached_graph: LegalGraph | None = None


def get_graph_dep(registry: Annotated[LawRegistry, Depends(get_law_registry)]) -> LegalGraph:
    """Dependency that provides a singleton :class:`LegalGraph`."""
    global _cached_graph
    if _cached_graph is None:
        _cached_graph = build_graph(registry)
    return _cached_graph


@router.get("/neighbors/{law_id}", response_model=GraphNeighborsResponse)
def get_neighbors(
    law_id: str,
    graph: Annotated[LegalGraph, Depends(get_graph_dep)],
) -> GraphNeighborsResponse:
    """Return the direct successors (outgoing references) of a law node."""
    neighbors = graph.get_neighbors(law_id)
    return GraphNeighborsResponse(law_id=law_id, neighbors=neighbors, count=len(neighbors))


@router.get("/path", response_model=list[str])
def get_path(
    from_id: str = Query(..., alias="from_id"),
    to_id: str = Query(..., alias="to_id"),
    graph: LegalGraph = Depends(get_graph_dep),
) -> list[str]:
    """Return the shortest directed path between two law nodes."""
    try:
        return shortest_path(graph, from_id, to_id)
    except (nx.NetworkXNoPath, nx.NodeNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/subgraph/{law_id}", response_model=GraphSubgraphResponse)
def get_subgraph(
    law_id: str,
    depth: int = Query(1, ge=1, le=3),
    graph: LegalGraph = Depends(get_graph_dep),
) -> GraphSubgraphResponse:
    """Return the ego-subgraph around a law node up to a given depth."""
    sub = graph.get_subgraph(law_id, depth=depth)
    nodes = [
        GraphNodeData(id=n, **{k: v for k, v in sub.nodes[n].items() if k in {"title", "rank", "status"}})
        for n in sub.nodes
    ]
    edges = [
        GraphEdgeData(source=u, target=v, source_article=sub.edges[u, v].get("source_article")) for u, v in sub.edges
    ]
    return GraphSubgraphResponse(nodes=nodes, edges=edges)


@router.get("/stats", response_model=GraphStatsResponse)
def get_stats(graph: LegalGraph = Depends(get_graph_dep)) -> GraphStatsResponse:
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
    n: int = Query(10, ge=1, le=100),
    graph: LegalGraph = Depends(get_graph_dep),
) -> list[GraphTopItem]:
    """Return the top-n most referenced laws by PageRank score."""
    items = top_laws(graph, n=n)
    g = graph.graph
    return [
        GraphTopItem(law_id=law_id, score=round(score, 6), title=g.nodes[law_id].get("title"))
        for law_id, score in items
    ]
