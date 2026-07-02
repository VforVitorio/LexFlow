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

# (identifier, rank, year, scope, status, jurisdiction, subjects, department).
# One law per filter axis so each filter has exactly one or two matches and a
# clear "narrowed" expectation. ``subjects`` seeds the official BOE tag
# taxonomy (#671) — deliberately accented/mixed-case so the tests exercise the
# boundary normalisation ("Protección de Datos" → proteccion-de-datos).
# ``department`` seeds the issuing-ministerio facet (#671 gap B); two laws
# share a department, two carry no department (``None``) so the "no facet
# value" path is exercised too. Total fixture size is 5.
_LAW_SPECS = [
    (
        "BOE-A-2000-1",
        "ley",
        2000,
        "Estatal",
        "in_force",
        "es",
        ["Protección de Datos", "Administración"],
        "Ministerio de Justicia",
    ),
    (
        "BOE-A-2018-2",
        "ley_organica",
        2018,
        "Estatal",
        "in_force",
        "es",
        ["Protección de Datos"],
        "Ministerio de Justicia",
    ),
    ("BOE-A-2021-3", "ley", 2021, "Autonómico", "in_force", "es-md", ["Vivienda"], None),
    (
        "BOE-A-2015-4",
        "real_decreto",
        2015,
        "Estatal",
        "in_force",
        "es",
        ["Administración"],
        "Ministerio de Hacienda",
    ),
    ("BOE-A-2010-5", "ley", 2010, "Estatal", "repealed", "es", ["Vivienda", "Administración"], None),
]
_TOTAL_LAWS = len(_LAW_SPECS)


def _write_law(root: Path, spec: tuple[str, str, int, str, str, str, list[str], str | None]) -> None:
    identifier, rank, year, scope, status, jurisdiction, subjects, department = spec
    subjects_yaml = ", ".join(f'"{s}"' for s in subjects)
    frontmatter = (
        f'title: "Norma {identifier}"\n'
        f'identifier: "{identifier}"\n'
        f'country: "es"\n'
        f'rank: "{rank}"\n'
        f'publication_date: "{year}-05-10"\n'
        f'status: "{status}"\n'
        f'scope: "{scope}"\n'
        f'jurisdiction: "{jurisdiction}"\n'
        f"subjects: [{subjects_yaml}]\n"
    )
    if department is not None:
        frontmatter += f'department: "{department}"\n'
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


def _search_items(client: TestClient, q: str, **params: object) -> list[Any]:
    response = client.get("/api/v1/laws/search", params={"q": q, "page_size": 100, **params})
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


class TestTagFilter:
    """Official topic-tag filter + summary passthrough (#671)."""

    def test_summaries_carry_normalised_tags(self, filter_client: TestClient) -> None:
        # Every summary surfaces its `subjects`-derived tags as kebab slugs so
        # the Explorer can render chips without a detail fetch.
        by_id = {i["identifier"]: i for i in _items(filter_client)}
        assert set(by_id["BOE-A-2000-1"]["tags"]) == {"proteccion-de-datos", "administracion"}
        assert by_id["BOE-A-2018-2"]["tags"] == ["proteccion-de-datos"]

    def test_single_tag_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, tags="proteccion-de-datos")
        assert {i["identifier"] for i in items} == {"BOE-A-2000-1", "BOE-A-2018-2"}
        assert all("proteccion-de-datos" in i["tags"] for i in items)

    def test_multiple_tags_are_anded(self, filter_client: TestClient) -> None:
        # Only BOE-A-2000-1 carries BOTH subjects.
        items = _items(filter_client, tags=["proteccion-de-datos", "administracion"])
        assert {i["identifier"] for i in items} == {"BOE-A-2000-1"}

    def test_tag_input_is_normalised_at_the_boundary(self, filter_client: TestClient) -> None:
        # Accented, mixed-case input still matches the stored kebab slug.
        items = _items(filter_client, tags="Administración")
        assert {i["identifier"] for i in items} == {"BOE-A-2000-1", "BOE-A-2015-4", "BOE-A-2010-5"}

    def test_tag_combines_with_other_filter(self, filter_client: TestClient) -> None:
        # tag=administracion AND status=repealed → only the 2010 repealed law.
        items = _items(filter_client, tags="administracion", status="repealed")
        assert {i["identifier"] for i in items} == {"BOE-A-2010-5"}

    def test_unknown_tag_returns_nothing(self, filter_client: TestClient) -> None:
        assert _items(filter_client, tags="no-such-tag") == []


class TestSearchTagFilter:
    """`/laws/search` honours the same tag facet as `/laws` (#671).

    Every law title contains "Norma", so `q="Norma"` matches all five at the
    law level; the `tags` facet then narrows exactly like the list endpoint.
    """

    def test_search_without_tag_finds_all(self, filter_client: TestClient) -> None:
        law_ids = {i["law_id"] for i in _search_items(filter_client, "Norma")}
        assert law_ids == {spec[0] for spec in _LAW_SPECS}

    def test_search_single_tag_narrows(self, filter_client: TestClient) -> None:
        items = _search_items(filter_client, "Norma", tags="proteccion-de-datos")
        assert {i["law_id"] for i in items} == {"BOE-A-2000-1", "BOE-A-2018-2"}

    def test_search_tags_are_anded(self, filter_client: TestClient) -> None:
        items = _search_items(filter_client, "Norma", tags=["proteccion-de-datos", "administracion"])
        assert {i["law_id"] for i in items} == {"BOE-A-2000-1"}


class TestDepartmentFilter:
    """Issuing-department (ministerio) filter + summary passthrough (#671 gap B)."""

    def test_summaries_carry_department(self, filter_client: TestClient) -> None:
        # Every summary surfaces its `department` (or None) so the Explorer
        # can filter and render the active chip without a detail fetch.
        by_id = {i["identifier"]: i for i in _items(filter_client)}
        assert by_id["BOE-A-2000-1"]["department"] == "Ministerio de Justicia"
        assert by_id["BOE-A-2018-2"]["department"] == "Ministerio de Justicia"
        assert by_id["BOE-A-2021-3"]["department"] is None

    def test_department_narrows_and_matches(self, filter_client: TestClient) -> None:
        items = _items(filter_client, department="Ministerio de Justicia")
        assert {i["identifier"] for i in items} == {"BOE-A-2000-1", "BOE-A-2018-2"}
        assert len(items) < _TOTAL_LAWS
        assert all(i["department"] == "Ministerio de Justicia" for i in items)

    def test_department_combines_with_other_filter(self, filter_client: TestClient) -> None:
        # department=Ministerio de Justicia AND rank=ley_organica → only the 2018 law.
        items = _items(filter_client, department="Ministerio de Justicia", rank="ley_organica")
        assert {i["identifier"] for i in items} == {"BOE-A-2018-2"}

    def test_unknown_department_returns_nothing(self, filter_client: TestClient) -> None:
        assert _items(filter_client, department="Ministerio Inexistente") == []


class TestSearchDepartmentFilter:
    """`/laws/search` honours the same department facet as `/laws` (#671 gap B)."""

    def test_search_department_narrows(self, filter_client: TestClient) -> None:
        items = _search_items(filter_client, "Norma", department="Ministerio de Hacienda")
        assert {i["law_id"] for i in items} == {"BOE-A-2015-4"}

    def test_search_department_combines_with_other_filter(self, filter_client: TestClient) -> None:
        items = _search_items(filter_client, "Norma", department="Ministerio de Justicia", rank="ley")
        assert {i["law_id"] for i in items} == {"BOE-A-2000-1"}
