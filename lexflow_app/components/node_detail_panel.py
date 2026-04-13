"""Node detail panel — shows law metadata when a graph node is selected."""

from __future__ import annotations

from typing import Any

import httpx
import reflex as rx


class NodeDetailState(rx.State):
    """State for the node detail side panel."""

    law_id: str = ""
    law_data: dict[str, Any] = {}  # noqa: RUF012
    loading: bool = False
    error: str = ""
    visible: bool = False

    async def load_law(self, law_id: str) -> None:
        """Fetch law detail from the API."""
        self.law_id = law_id
        self.visible = True
        self.loading = True
        self.error = ""
        self.law_data = {}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"http://localhost:8000/api/v1/laws/{law_id}",
                    timeout=10.0,
                )
                resp.raise_for_status()
                self.law_data = resp.json()
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)
        finally:
            self.loading = False

    def close(self) -> None:
        """Close the detail panel."""
        self.visible = False
        self.law_id = ""
        self.law_data = {}


def _detail_row(label: str, value: rx.Component | str) -> rx.Component:
    """Render a label-value row."""
    return rx.hstack(
        rx.text(label, size="2", color="var(--gray-10)", min_width="120px"),
        rx.text(value, size="2") if isinstance(value, str) else value,
        spacing="2",
        width="100%",
    )


def node_detail_panel() -> rx.Component:
    """Side panel showing detailed metadata for the selected graph node."""
    return rx.cond(
        NodeDetailState.visible,
        rx.box(
            rx.vstack(
                # Header
                rx.hstack(
                    rx.heading(
                        NodeDetailState.law_id,
                        size="4",
                        no_of_lines=1,
                    ),
                    rx.spacer(),
                    rx.icon_button(
                        rx.icon("x", size=14),
                        on_click=NodeDetailState.close,
                        variant="ghost",
                        size="1",
                    ),
                    width="100%",
                ),
                rx.divider(),
                # Content
                rx.cond(
                    NodeDetailState.loading,
                    rx.spinner(),
                    rx.cond(
                        NodeDetailState.error != "",
                        rx.callout(NodeDetailState.error, color_scheme="red"),
                        rx.vstack(
                            rx.text(
                                NodeDetailState.law_data.get("title", ""),  # type: ignore[union-attr]
                                size="3",
                                font_weight="500",
                            ),
                            rx.divider(),
                            rx.vstack(
                                _detail_row(
                                    "Rango",
                                    rx.badge(
                                        NodeDetailState.law_data.get("rank", ""),  # type: ignore[union-attr]
                                        color_scheme="blue",
                                    ),
                                ),
                                _detail_row(
                                    "Estado",
                                    rx.badge(
                                        NodeDetailState.law_data.get("status", ""),  # type: ignore[union-attr]
                                        color_scheme="green",
                                    ),
                                ),
                                _detail_row("Publicación", NodeDetailState.law_data.get("publication_date", "") or "—"),  # type: ignore[union-attr]
                                _detail_row("Departamento", NodeDetailState.law_data.get("department", "") or "—"),  # type: ignore[union-attr]
                                _detail_row("Ámbito", NodeDetailState.law_data.get("scope", "") or "—"),  # type: ignore[union-attr]
                                _detail_row("Jurisdicción", NodeDetailState.law_data.get("jurisdiction", "") or "—"),  # type: ignore[union-attr]
                                spacing="2",
                                width="100%",
                            ),
                            rx.link(
                                rx.button("Ver ley completa →", size="2", variant="outline"),
                                href=f"/laws/{NodeDetailState.law_id}",
                            ),
                            spacing="3",
                            width="100%",
                        ),
                    ),
                ),
                spacing="3",
                width="100%",
            ),
            position="fixed",
            right="0",
            top="0",
            height="100vh",
            width="340px",
            background="white",
            border_left="1px solid var(--gray-4)",
            padding="1.5em",
            overflow_y="auto",
            z_index="100",
            box_shadow="-4px 0 16px rgba(0,0,0,0.08)",
        ),
        rx.fragment(),
    )
