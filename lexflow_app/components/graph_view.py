"""Reflex graph visualization component."""
from __future__ import annotations

from typing import Any

import httpx
import reflex as rx


class GraphVizState(rx.State):
    """State for the interactive graph visualization."""

    center_id: str = ""
    depth: int = 1
    figure_json: str = "{}"  # JSON-serialised Plotly figure
    loading: bool = False
    error: str = ""
    selected_node: str = ""

    async def load_subgraph(self) -> None:
        """Fetch the subgraph figure from the API."""
        if not self.center_id:
            return
        self.loading = True
        self.error = ""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"http://localhost:8000/api/v1/graph/subgraph/{self.center_id}",
                    params={"depth": self.depth},
                    timeout=15.0,
                )
                resp.raise_for_status()
                # Store raw subgraph data for local rendering
                self.figure_json = resp.text
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)
        finally:
            self.loading = False

    def set_center(self, law_id: str) -> None:
        """Set the center law and reload."""
        self.center_id = law_id
        return GraphVizState.load_subgraph  # type: ignore[return-value]

    def set_depth(self, depth: str) -> None:
        """Set hop depth and reload."""
        self.depth = int(depth)
        return GraphVizState.load_subgraph  # type: ignore[return-value]

    def select_node(self, node_id: str) -> None:
        """Handle node click — set selected_node for detail panel."""
        self.selected_node = node_id


def graph_search_bar() -> rx.Component:
    """Search input to set the center law ID."""
    return rx.hstack(
        rx.input(
            placeholder="Identificador BOE (ej. BOE-A-1978-31229)",
            value=GraphVizState.center_id,
            on_change=GraphVizState.set_center,
            width="360px",
        ),
        rx.select(
            ["1", "2", "3"],
            value=GraphVizState.depth.to_string(),  # type: ignore[attr-defined]
            on_change=GraphVizState.set_depth,
            placeholder="Profundidad",
        ),
        rx.button("Ver grafo", on_click=GraphVizState.load_subgraph, size="2"),  # type: ignore[arg-type]
        spacing="2",
        align="center",
    )


def graph_viz_page() -> rx.Component:
    """Full graph visualization page."""
    return rx.vstack(
        rx.heading("Grafo de conocimiento legal", size="7"),
        graph_search_bar(),
        rx.cond(
            GraphVizState.loading,
            rx.spinner(size="3"),
            rx.cond(
                GraphVizState.error != "",
                rx.callout(GraphVizState.error, color_scheme="red"),
                rx.cond(
                    GraphVizState.center_id != "",
                    rx.box(
                        rx.text(
                            "Introduce un identificador BOE y pulsa 'Ver grafo'",
                            color="var(--gray-9)",
                        ),
                    ),
                    rx.text("Grafo cargado — integra rx.plotly aquí", color="var(--gray-11)"),
                ),
            ),
        ),
        spacing="4",
        width="100%",
    )
