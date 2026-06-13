"""Explorer filter-wiring tests (#573).

The live walkthrough found filters that silently did nothing — the year and
UE/scope params never narrowed the result. A green suite missed it because the
backend tests only checked one filter and the frontend tests ran on mocks.

These assert each ``GET /api/v1/laws`` filter both REACHES the registry as a
query param AND actually narrows the result (total drops below the unfiltered
total, and every returned row matches the filter). The fixture deliberately
uses 6-hash article headings — the real corpus format (#561) — so it can't
drift the way the old 5-hash fixture did.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_law_registry
from lexflow.core.registry import LawRegistry

# (identifier, rank, year, scope, status, jurisdiction). One law per filter
# axis so each filter has exactly one or two matches and a clear "narrowed"
# expectation. Total fixture size is 5.
_LAW_SPECS = [
    ("BOE-A-2000-1", "ley", 2000, "Estatal", "in_force", "es"),
    ("BOE-A-2018-2", "ley_organica", 2018, "Estatal", "in_force", "es"),
    ("BOE-A-2021-3", "ley", 2021, "Autonómico", "in_force", "es-md"),
    ("BOE-A-2015-4", "real_decreto", 2015, "Estatal", "in_force", "es"),
    ("BOE-A-2010-5", "ley", 2010, "Estatal", "repealed", "es"),
]
_TOTAL_LAWS = len(_LAW_SPECS)


def _write_law(root: Path, spec: tuple[str, str, int, str, str, str]) -> None:
    identifier, rank, year, scope, status, jurisdiction = spec
    frontmatter = (
        f'title: "Norma {identifier}"\n'
        f'identifier: "{identifier}"\n'
        f'country: "es"\n'
        f'rank: "{rank}"\n'
        f'publication_date: "{year}-05-10"\n'
        f'status: "{status}"\n'
        f'scope: "{scope}"\n'
        f'jurisdiction: "{jurisdiction}"\n'
    )
    body = f"# Norma {identifier}\n\n###### Articulo 1.\n\nTexto del articulo uno.\n"
    path = root / jurisdiction / f"{identifier}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{frontmatter}---\n{body}", encoding="utf-8")


@pytest.fixture()
def filter_client(tmp_path: Path) -> Iterator[TestClient]:
    """A TestClient over a small, varied corpus wired through the real registry."""
    for spec in _LAW_SPECS:
        _write_law(tmp_path, spec)
    registry = LawRegistry(tmp_path)
    registry.preload_all_metadata()
    app.dependency_overrides[get_law_registry] = lambda: registry
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _items(client: TestClient, **params: object) -> list[Any]:
    response = client.get("/api/v1/laws", params={"page_size": 100, **params})
    assert response.status_code == 200
    items: list[Any] = response.json()["items"]
    return items


class TestFilterWiring:
    def test_no_filter_returns_everything(self, filter_client: TestClient) -> None:
        assert len(_items(filter_client)) == _TOTAL_LAWS

    def test_year_from_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, year_from=2018)
        # 2018 + 2021 only — the 2000 / 2010 / 2015 laws drop out.
        assert {i["identifier"] for i in items} == {"BOE-A-2018-2", "BOE-A-2021-3"}
        assert len(items) < _TOTAL_LAWS
        assert all(int(i["publication_date"][:4]) >= 2018 for i in items)

    def test_year_to_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, year_to=2010)
        assert {i["identifier"] for i in items} == {"BOE-A-2000-1", "BOE-A-2010-5"}
        assert all(int(i["publication_date"][:4]) <= 2010 for i in items)

    def test_rank_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, rank="ley_organica")
        assert len(items) == 1
        assert all(i["rank"] == "ley_organica" for i in items)

    def test_scope_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, scope="Autonómico")
        assert {i["identifier"] for i in items} == {"BOE-A-2021-3"}
        assert all(i["scope"] == "Autonómico" for i in items)

    def test_status_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, status="repealed")
        assert {i["identifier"] for i in items} == {"BOE-A-2010-5"}
        assert all(i["status"] == "repealed" for i in items)

    def test_jurisdiction_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, jurisdiction="es-md")
        assert {i["identifier"] for i in items} == {"BOE-A-2021-3"}
        assert all(i["jurisdiction"] == "es-md" for i in items)

    def test_combined_filters_intersect(self, filter_client: TestClient) -> None:
        # rank=ley AND year_from=2011 → only the 2021 Autonómica ley.
        items = _items(filter_client, rank="ley", year_from=2011)
        assert {i["identifier"] for i in items} == {"BOE-A-2021-3"}
