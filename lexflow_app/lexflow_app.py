"""LexFlow Reflex application — main entry point."""

from __future__ import annotations

import reflex as rx

from lexflow_app.pages.home import home_page
from lexflow_app.pages.laws import laws_page


def index() -> rx.Component:
    """Default index page — redirect to laws explorer."""
    return home_page()


app = rx.App(
    theme=rx.theme(
        appearance="light",
        accent_color="blue",
        radius="medium",
    ),
)
app.add_page(index, route="/")
app.add_page(laws_page, route="/laws")
