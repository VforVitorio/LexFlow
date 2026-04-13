"""Laws explorer page with filtering and pagination."""

from __future__ import annotations

from typing import Any

import httpx
import reflex as rx


class LawsState(rx.State):
    """State for the laws explorer page."""

    laws: list[dict[str, Any]] = []  # noqa: RUF012
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 1
    loading: bool = False
    error: str = ""

    # Filters
    rank_filter: str = ""
    status_filter: str = ""
    search_query: str = ""

    RANK_OPTIONS: list[str] = [  # noqa: RUF012
        "",
        "ley",
        "ley_organica",
        "real_decreto",
        "real_decreto_ley",
        "real_decreto_legislativo",
        "decreto_legislativo",
        "orden",
        "otro",
    ]
    STATUS_OPTIONS: list[str] = [  # noqa: RUF012
        "",
        "in_force",
        "repealed",
        "partially_repealed",
        "pending",
    ]

    async def load_laws(self) -> None:
        """Fetch laws from the API with current filters."""
        self.loading = True
        self.error = ""
        params: dict[str, Any] = {"page": self.page, "page_size": self.page_size}
        if self.rank_filter:
            params["rank"] = self.rank_filter
        if self.status_filter:
            params["status"] = self.status_filter
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "http://localhost:8000/api/v1/laws",
                    params=params,
                    timeout=10.0,
                )
                resp.raise_for_status()
                data = resp.json()
                self.laws = data.get("items", [])
                self.total = data.get("total", 0)
                self.total_pages = data.get("total_pages", 1)
        except Exception as exc:
            self.error = str(exc)
            self.laws = []
        finally:
            self.loading = False

    def set_page(self, page: int) -> None:
        """Navigate to a specific page."""
        self.page = page
        return LawsState.load_laws  # type: ignore[return-value]

    def set_rank_filter(self, value: str) -> None:
        """Set rank filter and reload."""
        self.rank_filter = value
        self.page = 1
        return LawsState.load_laws  # type: ignore[return-value]

    def set_status_filter(self, value: str) -> None:
        """Set status filter and reload."""
        self.status_filter = value
        self.page = 1
        return LawsState.load_laws  # type: ignore[return-value]


def law_row(law: dict[str, Any]) -> rx.Component:
    """Render a single law as a table row."""
    return rx.table.row(
        rx.table.cell(rx.text(law["identifier"], size="1", color="var(--gray-9)")),
        rx.table.cell(rx.text(law["title"], size="2")),
        rx.table.cell(rx.badge(law["rank"], color_scheme="blue")),
        rx.table.cell(
            rx.badge(
                law["status"],
                color_scheme=rx.cond(law["status"] == "in_force", "green", "red"),
            )
        ),
        rx.table.cell(rx.text(law.get("publication_date", "-") or "-", size="1")),
    )


def filter_bar() -> rx.Component:
    """Filter controls for rank and status."""
    return rx.hstack(
        rx.select(
            LawsState.RANK_OPTIONS,
            value=LawsState.rank_filter,
            on_change=LawsState.set_rank_filter,
            placeholder="Rango",
        ),
        rx.select(
            LawsState.STATUS_OPTIONS,
            value=LawsState.status_filter,
            on_change=LawsState.set_status_filter,
            placeholder="Estado",
        ),
        spacing="2",
    )


def pagination() -> rx.Component:
    """Pagination controls."""
    return rx.hstack(
        rx.button(
            "←",
            on_click=LawsState.set_page(LawsState.page - 1),  # type: ignore[arg-type]
            is_disabled=LawsState.page <= 1,
            variant="outline",
            size="2",
        ),
        rx.text(
            LawsState.page.to_string(),  # type: ignore[attr-defined]
            " / ",
            LawsState.total_pages.to_string(),  # type: ignore[attr-defined]
            size="2",
        ),
        rx.button(
            "→",
            on_click=LawsState.set_page(LawsState.page + 1),  # type: ignore[arg-type]
            is_disabled=LawsState.page >= LawsState.total_pages,
            variant="outline",
            size="2",
        ),
        spacing="2",
        align="center",
    )


def laws_explorer_page() -> rx.Component:
    """Full laws explorer page."""
    return rx.vstack(
        rx.heading("Explorador de leyes", size="7"),
        filter_bar(),
        rx.cond(
            LawsState.loading,
            rx.spinner(),
            rx.cond(
                LawsState.error != "",
                rx.callout(LawsState.error, color_scheme="red"),
                rx.vstack(
                    rx.table.root(
                        rx.table.header(
                            rx.table.row(
                                rx.table.column_header_cell("ID"),
                                rx.table.column_header_cell("Título"),
                                rx.table.column_header_cell("Rango"),
                                rx.table.column_header_cell("Estado"),
                                rx.table.column_header_cell("Publicación"),
                            )
                        ),
                        rx.table.body(rx.foreach(LawsState.laws, law_row)),
                        width="100%",
                    ),
                    pagination(),
                    spacing="4",
                    width="100%",
                ),
            ),
        ),
        spacing="4",
        width="100%",
        on_mount=LawsState.load_laws,  # type: ignore[arg-type]
    )
