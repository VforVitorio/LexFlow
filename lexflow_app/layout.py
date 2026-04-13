"""Shared layout component — sidebar navigation + content area."""

from __future__ import annotations

import reflex as rx

NAV_ITEMS = [
    ("Home", "/", "home"),
    ("Laws", "/laws", "book-open"),
    ("Graph", "/graph", "share-2"),
    ("Chat", "/chat", "message-circle"),
    ("Dashboards", "/dashboards", "bar-chart-2"),
]


def nav_link(label: str, href: str, icon: str) -> rx.Component:
    """A single navigation item."""
    return rx.link(
        rx.hstack(
            rx.icon(icon, size=16),
            rx.text(label, size="3"),
            spacing="2",
            align="center",
        ),
        href=href,
        color_scheme="gray",
        underline="none",
        width="100%",
        padding="0.5em 0.75em",
        border_radius="6px",
        _hover={"background": "var(--accent-2)"},
    )


def sidebar() -> rx.Component:
    """Left navigation sidebar."""
    return rx.box(
        rx.vstack(
            rx.hstack(
                rx.icon("scale", size=24, color="var(--accent-9)"),
                rx.text("LexFlow", size="5", font_weight="700"),
                spacing="2",
                align="center",
            ),
            rx.divider(),
            *[nav_link(label, href, icon) for label, href, icon in NAV_ITEMS],
            spacing="1",
            align="start",
            width="100%",
        ),
        width="220px",
        min_height="100vh",
        padding="1.5em 1em",
        border_right="1px solid var(--gray-4)",
        background="var(--gray-1)",
    )


def layout(content: rx.Component) -> rx.Component:
    """Wrap content in the main two-column layout."""
    return rx.hstack(
        sidebar(),
        rx.box(
            content,
            flex="1",
            padding="2em",
            min_height="100vh",
            overflow_y="auto",
        ),
        spacing="0",
        align="start",
        width="100%",
    )
