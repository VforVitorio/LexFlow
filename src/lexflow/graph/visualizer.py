"""Convert a LegalGraph subgraph to a Plotly network figure."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import networkx as nx
import plotly.graph_objects as go  # type: ignore[import-untyped]

if TYPE_CHECKING:
    from lexflow.graph.model import LegalGraph


def _layout_positions(g: nx.DiGraph) -> dict[str, tuple[float, float]]:
    """Compute 2-D positions using spring layout."""
    if len(g) == 0:
        return {}
    raw: dict[str, Any] = nx.spring_layout(g, seed=42, k=2.0 / max(len(g) ** 0.5, 1))
    return {k: (float(v[0]), float(v[1])) for k, v in raw.items()}


def subgraph_to_figure(
    graph: "LegalGraph",
    center_id: str,
    depth: int = 1,
    width: int = 800,
    height: int = 600,
) -> go.Figure:
    """Return a Plotly Figure representing the ego-subgraph around *center_id*.

    Args:
        graph: The full LegalGraph.
        center_id: The law identifier to centre the view on.
        depth: How many hops out to include.
        width: Figure width in pixels.
        height: Figure height in pixels.

    Returns:
        A Plotly Figure with nodes as scatter markers and edges as lines.
    """
    g = graph.get_subgraph(center_id, depth=depth)
    pos = _layout_positions(g)
    if not pos:
        return go.Figure()

    # --- Edge traces ---
    edge_x: list[float | None] = []
    edge_y: list[float | None] = []
    for src, dst in g.edges():
        if src in pos and dst in pos:
            x0, y0 = pos[src]
            x1, y1 = pos[dst]
            edge_x.extend([x0, x1, None])
            edge_y.extend([y0, y1, None])

    edge_trace = go.Scatter(
        x=edge_x,
        y=edge_y,
        line={"width": 0.8, "color": "#aaa"},
        hoverinfo="none",
        mode="lines",
        showlegend=False,
    )

    # --- Node traces ---
    node_x = [pos[n][0] for n in g.nodes() if n in pos]
    node_y = [pos[n][1] for n in g.nodes() if n in pos]
    node_ids = [n for n in g.nodes() if n in pos]
    node_attrs = [g.nodes[n] for n in node_ids]
    node_text = [f"{n}<br>{attrs.get('title', '')[:60]}" for n, attrs in zip(node_ids, node_attrs)]
    node_colors = ["#e63946" if n == center_id else "#457b9d" for n in node_ids]

    node_trace = go.Scatter(
        x=node_x,
        y=node_y,
        mode="markers+text",
        hoverinfo="text",
        hovertext=node_text,
        text=[n if n == center_id else "" for n in node_ids],
        textposition="top center",
        marker={
            "size": [16 if n == center_id else 10 for n in node_ids],
            "color": node_colors,
            "line": {"width": 1, "color": "white"},
        },
        showlegend=False,
        customdata=node_ids,
    )

    fig = go.Figure(
        data=[edge_trace, node_trace],
        layout=go.Layout(
            width=width,
            height=height,
            margin={"l": 10, "r": 10, "t": 10, "b": 10},
            xaxis={"showgrid": False, "zeroline": False, "showticklabels": False},
            yaxis={"showgrid": False, "zeroline": False, "showticklabels": False},
            plot_bgcolor="white",
            paper_bgcolor="white",
            hovermode="closest",
        ),
    )
    return cast(go.Figure, fig)
