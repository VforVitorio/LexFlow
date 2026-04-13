"""Accessible Reflex component helpers."""

from __future__ import annotations

import reflex as rx


def sr_only(text: str) -> rx.Component:
    """Screen-reader-only text (visually hidden, announced by screen readers)."""
    return rx.text(
        text,
        position="absolute",
        width="1px",
        height="1px",
        padding="0",
        margin="-1px",
        overflow="hidden",
        clip="rect(0,0,0,0)",
        white_space="nowrap",
        border_width="0",
    )


def accessible_button(
    label: str,
    on_click: rx.EventSpec | None = None,  # type: ignore[type-arg]
    aria_label: str | None = None,
    variant: str = "solid",
    size: str = "2",
    color_scheme: str = "blue",
) -> rx.Component:
    """A button with proper ARIA label and keyboard focus ring."""
    return rx.button(
        label,
        on_click=on_click,  # type: ignore[arg-type]
        aria_label=aria_label or label,
        variant=variant,
        size=size,
        color_scheme=color_scheme,
    )


def accessible_icon_button(
    icon_name: str,
    aria_label: str,
    on_click: rx.EventSpec | None = None,  # type: ignore[type-arg]
) -> rx.Component:
    """Icon-only button with a required ARIA label."""
    return rx.icon_button(
        rx.icon(icon_name, size=16),
        on_click=on_click,  # type: ignore[arg-type]
        aria_label=aria_label,
    )


def skip_to_main() -> rx.Component:
    """Skip-navigation link for keyboard users."""
    return rx.link(
        "Saltar al contenido principal",
        href="#main-content",
        position="absolute",
        top="-100px",
        left="0",
        padding="8px 16px",
        background="var(--accent-9)",
        color="white",
        z_index="9999",
        border_radius="0 0 4px 0",
    )
