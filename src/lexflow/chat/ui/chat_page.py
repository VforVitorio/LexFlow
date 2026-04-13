"""Reflex chat page for the LexFlow legal assistant UI."""

from __future__ import annotations

from typing import Any

import reflex as rx

from lexflow.chat.ui.state import ChatState


def message_bubble(message: dict[str, Any]) -> rx.Component:
    """Render a single chat message as a styled bubble.

    Args:
        message: Dict with ``role`` (``"user"`` or ``"assistant"``) and
            ``content`` (Markdown string).

    Returns:
        A Reflex component representing the message bubble.
    """
    return rx.box(
        rx.markdown(message["content"]),
        padding="0.75em 1em",
        border_radius="12px",
        background=rx.cond(
            message["role"] == "user",
            "var(--accent-9)",
            "var(--gray-3)",
        ),
        color=rx.cond(
            message["role"] == "user",
            "white",
            "inherit",
        ),
        align_self=rx.cond(
            message["role"] == "user",
            "flex-end",
            "flex-start",
        ),
        max_width="80%",
        width="fit-content",
    )


def chat_page() -> rx.Component:
    """Build the full chat page layout.

    Returns:
        A Reflex component tree containing the header, message list,
        typing indicator, and input bar.
    """
    return rx.vstack(
        # --- Header: provider and model selectors ---
        rx.hstack(
            rx.text("LexFlow Chat", font_size="1.25em", font_weight="600"),
            rx.spacer(),
            rx.select(
                ChatState.PROVIDERS,
                value=ChatState.provider_name,
                on_change=ChatState.set_provider,
                placeholder="Selecciona proveedor",
                size="2",
            ),
            rx.select(
                ChatState.available_models,
                value=ChatState.model,
                on_change=ChatState.set_model,
                placeholder="Selecciona modelo",
                size="2",
            ),
            rx.button(
                "Cargar modelos",
                on_click=ChatState.load_models,
                size="2",
                variant="soft",
            ),
            width="100%",
            padding="0.75em 1em",
            border_bottom="1px solid var(--gray-5)",
            align="center",
        ),
        # --- Message area ---
        rx.scroll_area(
            rx.vstack(
                rx.foreach(ChatState.messages, message_bubble),
                spacing="3",
                align_items="stretch",
                padding="1em",
                min_height="100%",
            ),
            flex="1",
            width="100%",
            overflow_y="auto",
        ),
        # --- Typing indicator ---
        rx.cond(
            ChatState.is_streaming,
            rx.text("Escribiendo...", color="gray", font_size="0.875em", padding_left="1em"),
            rx.text("", display="none"),
        ),
        # --- Input bar ---
        rx.hstack(
            rx.input(
                value=ChatState.input_value,
                on_change=ChatState.set_input,
                on_key_down=lambda key: rx.cond(
                    key == "Enter",
                    ChatState.send_message(),  # type: ignore[call-arg]
                    rx.noop(),
                ),
                placeholder="Escribe tu pregunta legal...",
                flex="1",
                size="3",
                disabled=ChatState.is_streaming,
            ),
            rx.button(
                "Enviar",
                on_click=ChatState.send_message,
                loading=ChatState.is_streaming,
                size="3",
            ),
            width="100%",
            padding="0.75em 1em",
            border_top="1px solid var(--gray-5)",
            align="center",
        ),
        width="100%",
        max_width="800px",
        margin="auto",
        height="100vh",
        spacing="0",
    )
