"""Graph filter panel Reflex component."""

from __future__ import annotations

import reflex as rx

RANK_OPTIONS = [
    ("", "Todos los rangos"),
    ("ley", "Ley"),
    ("ley_organica", "Ley Orgánica"),
    ("real_decreto", "Real Decreto"),
    ("real_decreto_ley", "Real Decreto-ley"),
    ("real_decreto_legislativo", "Real Decreto Legislativo"),
    ("decreto_legislativo", "Decreto Legislativo"),
    ("orden", "Orden"),
    ("otro", "Otro"),
]

STATUS_OPTIONS = [
    ("", "Todos los estados"),
    ("in_force", "Vigente"),
    ("repealed", "Derogada"),
    ("partially_repealed", "Parcialmente derogada"),
    ("pending", "Pendiente"),
]


class GraphFilterState(rx.State):
    """State for graph filter controls."""

    rank: str = ""
    status: str = ""
    year_from: str = ""
    year_to: str = ""
    jurisdiction: str = ""

    def set_rank(self, value: str) -> None:
        self.rank = value

    def set_status(self, value: str) -> None:
        self.status = value

    def set_year_from(self, value: str) -> None:
        self.year_from = value

    def set_year_to(self, value: str) -> None:
        self.year_to = value

    def set_jurisdiction(self, value: str) -> None:
        self.jurisdiction = value

    def reset_filters(self) -> None:
        """Clear all active filters."""
        self.rank = ""
        self.status = ""
        self.year_from = ""
        self.year_to = ""
        self.jurisdiction = ""

    @rx.var
    def active_count(self) -> int:
        """Number of currently active filters."""
        return sum(1 for v in [self.rank, self.status, self.year_from, self.year_to, self.jurisdiction] if v)


def graph_filter_panel() -> rx.Component:
    """Render filter controls for the graph visualization."""
    return rx.card(
        rx.vstack(
            rx.hstack(
                rx.heading("Filtros", size="4"),
                rx.spacer(),
                rx.cond(
                    GraphFilterState.active_count > 0,
                    rx.button(
                        "Limpiar",
                        on_click=GraphFilterState.reset_filters,
                        variant="ghost",
                        size="1",
                        color_scheme="red",
                    ),
                    rx.fragment(),
                ),
                width="100%",
            ),
            rx.select(
                [opt[0] for opt in RANK_OPTIONS],
                value=GraphFilterState.rank,
                on_change=GraphFilterState.set_rank,
                placeholder="Rango",
                size="2",
                width="100%",
            ),
            rx.select(
                [opt[0] for opt in STATUS_OPTIONS],
                value=GraphFilterState.status,
                on_change=GraphFilterState.set_status,
                placeholder="Estado",
                size="2",
                width="100%",
            ),
            rx.hstack(
                rx.input(
                    placeholder="Año desde",
                    value=GraphFilterState.year_from,
                    on_change=GraphFilterState.set_year_from,
                    type="number",
                    size="2",
                    width="50%",
                ),
                rx.input(
                    placeholder="Año hasta",
                    value=GraphFilterState.year_to,
                    on_change=GraphFilterState.set_year_to,
                    type="number",
                    size="2",
                    width="50%",
                ),
                spacing="2",
                width="100%",
            ),
            rx.input(
                placeholder="Jurisdicción (ej. es-md)",
                value=GraphFilterState.jurisdiction,
                on_change=GraphFilterState.set_jurisdiction,
                size="2",
                width="100%",
            ),
            spacing="3",
            width="100%",
        ),
        width="260px",
    )
