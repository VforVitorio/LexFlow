"""Laws explorer page — placeholder, full impl in feat/frontend-laws."""

from __future__ import annotations

import reflex as rx

from lexflow_app.layout import layout


def laws_page() -> rx.Component:
    """Paginated law explorer (stub — wired in feat/frontend-laws)."""
    return layout(
        rx.vstack(
            rx.heading("Explorador de leyes", size="7"),
            rx.text("Cargando leyes...", color="var(--gray-11)"),
            spacing="3",
        )
    )
