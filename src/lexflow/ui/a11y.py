"""Accessibility constants and helpers (framework-agnostic)."""

from __future__ import annotations

from dataclasses import dataclass

# WCAG 2.1 AA minimum contrast ratios
CONTRAST_AA_NORMAL = 4.5
CONTRAST_AA_LARGE = 3.0
CONTRAST_AAA_NORMAL = 7.0

# Color tokens for accessible UI
COLORS = {
    "text_primary": "#1a1a2e",
    "text_secondary": "#4a4a6a",
    "text_disabled": "#9a9ab0",
    "bg_primary": "#ffffff",
    "bg_secondary": "#f8f9fc",
    "accent": "#1d4ed8",
    "accent_hover": "#1e40af",
    "success": "#15803d",
    "error": "#b91c1c",
    "warning": "#b45309",
}

# Breakpoints (pixels) — consistent with Radix UI / Reflex defaults
BREAKPOINTS = {
    "xs": 520,
    "sm": 768,
    "md": 1024,
    "lg": 1280,
    "xl": 1640,
}


@dataclass(frozen=True)
class AriaLabel:
    """Predefined ARIA label strings for common interactive elements."""

    label: str
    description: str = ""


ARIA_LABELS = {
    "nav_main": AriaLabel("Navegación principal"),
    "nav_laws": AriaLabel("Explorador de leyes"),
    "nav_graph": AriaLabel("Grafo de conocimiento"),
    "nav_chat": AriaLabel("Chat legal"),
    "search_input": AriaLabel("Buscar leyes", "Introduce términos de búsqueda"),
    "filter_rank": AriaLabel("Filtrar por rango legal"),
    "filter_status": AriaLabel("Filtrar por estado de la ley"),
    "pagination_prev": AriaLabel("Página anterior"),
    "pagination_next": AriaLabel("Página siguiente"),
    "close_panel": AriaLabel("Cerrar panel"),
    "law_detail": AriaLabel("Detalle de la ley"),
}


def responsive_value(
    default: str,
    sm: str | None = None,
    md: str | None = None,
    lg: str | None = None,
) -> dict[str, str]:
    """Build a Reflex responsive value dict for CSS properties.

    Args:
        default: Value for extra-small screens.
        sm: Override for small screens (>=768px).
        md: Override for medium screens (>=1024px).
        lg: Override for large screens (>=1280px).

    Returns:
        A dict like ``{"initial": "...", "sm": "...", ...}`` for use with
        Reflex's responsive utility.
    """
    result: dict[str, str] = {"initial": default}
    if sm is not None:
        result["sm"] = sm
    if md is not None:
        result["md"] = md
    if lg is not None:
        result["lg"] = lg
    return result
