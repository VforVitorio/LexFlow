"""Home / landing page."""

from __future__ import annotations

import reflex as rx

from lexflow_app.layout import layout


def home_page() -> rx.Component:
    """Landing page with overview stats."""
    return layout(
        rx.vstack(
            rx.heading("LexFlow", size="9"),
            rx.text(
                "Explorador interactivo de legislación española.",
                size="4",
                color="var(--gray-11)",
            ),
            rx.hstack(
                rx.link(rx.button("Explorar leyes", size="3"), href="/laws"),
                rx.link(rx.button("Chat legal", size="3", variant="outline"), href="/chat"),
                spacing="3",
            ),
            spacing="4",
            align="start",
            padding_top="4em",
        )
    )
