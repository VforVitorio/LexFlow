"""Tests for tag extraction + the /api/v1/tags endpoint (issue #145).

Two layers:
* ``normalize_tag`` / ``extract_tags`` unit tests (parser).
* The endpoint against a registry whose frontmatter we control via a
  tmp law-dir fixture carrying tags.
"""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_law_registry
from lexflow.core.parser import extract_tags, normalize_tag
from lexflow.core.registry import LawRegistry


class TestNormalizeTag:
    def test_strips_accents_and_kebabs(self) -> None:
        assert normalize_tag("Protección de Datos") == "proteccion-de-datos"

    def test_collapses_punctuation_and_spaces(self) -> None:
        assert normalize_tag("  Derecho   Laboral!! ") == "derecho-laboral"

    def test_already_slug_is_idempotent(self) -> None:
        assert normalize_tag("derecho-laboral") == "derecho-laboral"

    def test_non_alphanumeric_yields_empty(self) -> None:
        assert normalize_tag("———") == ""


class TestExtractTags:
    def test_reads_list_form(self) -> None:
        raw = {"tags": ["Protección de Datos", "Digital"]}
        assert extract_tags(raw) == ["proteccion-de-datos", "digital"]

    def test_reads_comma_string_form(self) -> None:
        raw = {"keywords": "fiscal, tributario; IVA"}
        assert extract_tags(raw) == ["fiscal", "tributario", "iva"]

    def test_merges_all_three_sources_dedup_order_preserved(self) -> None:
        raw = {
            "tags": ["Laboral"],
            "categories": ["laboral", "Social"],  # 'laboral' dups → dropped
            "keywords": "Empleo",
        }
        assert extract_tags(raw) == ["laboral", "social", "empleo"]

    def test_reads_subjects_the_key_legalize_es_uses(self) -> None:
        # legalize-es frontmatter carries topics under `subjects` (#669).
        raw = {"subjects": ["Cementerios", "Defunciones", "Iglesia Católica"]}
        assert extract_tags(raw) == ["cementerios", "defunciones", "iglesia-catolica"]

    def test_missing_sources_yield_empty(self) -> None:
        assert extract_tags({"title": "x"}) == []


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

_FM_BASE = dedent("""\
    title: "{title}"
    identifier: "{identifier}"
    country: "es"
    rank: "ley"
    publication_date: "2020-01-01"
    status: "in_force"
    scope: "Estatal"
""")


def _write_law(root: Path, identifier: str, tags: list[str]) -> None:
    tags_yaml = "tags: [" + ", ".join(f'"{t}"' for t in tags) + "]\n" if tags else ""
    fm = _FM_BASE.format(title=f"Ley {identifier}", identifier=identifier) + tags_yaml
    path = root / "es" / f"{identifier}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{fm}---\n# Ley {identifier}\n\n##### Articulo 1.\nTexto.\n", encoding="utf-8")


@pytest.fixture()
def tagged_registry(tmp_path: Path):
    """A registry whose laws carry known tags, wired into the app."""
    _write_law(tmp_path, "BOE-A-2020-1", ["Protección de Datos", "Digital"])
    _write_law(tmp_path, "BOE-A-2020-2", ["protección de datos", "Laboral"])
    _write_law(tmp_path, "BOE-A-2020-3", [])
    registry = LawRegistry(tmp_path)
    registry.preload_all_metadata()
    app.dependency_overrides[get_law_registry] = lambda: registry
    yield registry
    app.dependency_overrides.clear()


class TestTagsEndpoint:
    def test_returns_ranked_vocabulary(self, client: TestClient, tagged_registry: LawRegistry) -> None:
        del tagged_registry
        response = client.get("/api/v1/tags")
        assert response.status_code == 200
        # Sprint 6 api-6: response is now {"items": [...]} instead of a bare list.
        items = response.json()["items"]
        # proteccion-de-datos appears on 2 laws → ranks first.
        assert items[0] == {"tag": "proteccion-de-datos", "count": 2}
        tags = {row["tag"]: row["count"] for row in items}
        assert tags["digital"] == 1
        assert tags["laboral"] == 1

    def test_empty_corpus_returns_empty_items(self, client: TestClient, mock_registry: object) -> None:
        # The shared mock_registry fixture has no tags in its frontmatter,
        # so the vocabulary is empty — endpoint must still 200 with
        # {"items": []} (Sprint 6 api-6).
        del mock_registry
        response = client.get("/api/v1/tags")
        assert response.status_code == 200
        assert response.json() == {"items": []}
