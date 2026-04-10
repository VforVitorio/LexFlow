"""Common test fixtures for the LexFlow test suite."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from textwrap import dedent

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_law_registry
from lexflow.core.registry import LawRegistry


@pytest.fixture()
def client() -> TestClient:
    """Provide a synchronous test client for the FastAPI application."""
    return TestClient(app)


@pytest.fixture()
def mock_registry(sample_law_dir: Path) -> Iterator[LawRegistry]:
    """Provide a LawRegistry backed by ``sample_law_dir`` and wire it into the app.

    Overrides the ``get_law_registry`` dependency so endpoint tests use
    test data instead of the real legalize-es submodule.
    """
    registry = LawRegistry(sample_law_dir)
    registry.preload_all_metadata()
    app.dependency_overrides[get_law_registry] = lambda: registry
    yield registry
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Sample data fixtures — used by parser and registry tests in later issues
# ---------------------------------------------------------------------------

SAMPLE_FRONTMATTER = dedent("""\
    title: "Ley 1/2000, de 7 de enero, de Enjuiciamiento Civil"
    identifier: "BOE-A-2000-323"
    country: "es"
    rank: "ley"
    publication_date: "2000-01-08"
    last_updated: "2025-06-15"
    status: "in_force"
    source: "https://www.boe.es/eli/es/l/2000/01/07/1/con"
    department: "Jefatura del Estado"
    enactment_date: "2000-01-07"
    official_journal: "BOE"
    journal_issue: "7"
    consolidation_status: "Finalizado"
    scope: "Estatal"
""")

SAMPLE_LAW_BODY = dedent("""\
    # Ley 1/2000, de 7 de enero, de Enjuiciamiento Civil

    ## TITULO I. De las disposiciones generales

    ### CAPITULO I. De la comparecencia y actuacion en juicio

    ##### Articulo 1.

    En los procesos civiles, los tribunales y quienes ante ellos acudan
    e intervengan deberan actuar con arreglo a lo dispuesto en esta Ley.

    ##### Articulo 2.

    1. Las normas procesales contenidas en la presente Ley seran de
    aplicacion conforme a lo establecido en la Ley 20/2011, de 21 de julio,
    del Registro Civil.
    2. No obstante lo anterior, se tendran en cuenta las disposiciones
    del Real Decreto 1665/1991.

    ## TITULO II. De la jurisdiccion y la competencia

    ##### Articulo 3.

    Para el conocimiento y resolucion de los procesos civiles con eficacia
    juridica, se observara lo dispuesto en el articulo 1 de esta Ley.
""")


@pytest.fixture()
def sample_frontmatter() -> str:
    """Return a minimal valid YAML frontmatter string."""
    return SAMPLE_FRONTMATTER


@pytest.fixture()
def sample_law_markdown(tmp_path: Path) -> Path:
    """Write a complete sample .md law file and return its path."""
    content = f"---\n{SAMPLE_FRONTMATTER}---\n{SAMPLE_LAW_BODY}"
    file_path = tmp_path / "es" / "BOE-A-2000-323.md"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    return file_path


@pytest.fixture()
def sample_law_dir(tmp_path: Path) -> Path:
    """Create a small directory tree mimicking legalize-es structure.

    Returns the root data path (equivalent to ``data/legalize-es/``).
    Contains two laws: one national and one regional.
    """
    # National law
    national = tmp_path / "es" / "BOE-A-2000-323.md"
    national.parent.mkdir(parents=True, exist_ok=True)
    national.write_text(
        f"---\n{SAMPLE_FRONTMATTER}---\n{SAMPLE_LAW_BODY}",
        encoding="utf-8",
    )

    # Regional law (Madrid)
    regional_frontmatter = dedent("""\
        title: "Ley 3/2018, de 22 de junio, de proteccion de datos"
        identifier: "BOE-A-2018-16673"
        country: "es"
        rank: "ley_organica"
        publication_date: "2018-12-06"
        last_updated: "2024-03-15"
        status: "in_force"
        source: "https://www.boe.es/eli/es/lo/2018/12/05/3/con"
        department: "Jefatura del Estado"
        enactment_date: "2018-12-05"
        official_journal: "BOE"
        journal_issue: "294"
        consolidation_status: "Finalizado"
        scope: "Estatal"
    """)
    regional_body = dedent("""\
        # Ley Organica 3/2018, de Proteccion de Datos

        ##### Articulo 1.

        La presente ley organica tiene por objeto garantizar los derechos
        digitales de la ciudadania conforme al BOE-A-2016-12328.
    """)
    regional = tmp_path / "es-md" / "BOE-A-2018-16673.md"
    regional.parent.mkdir(parents=True, exist_ok=True)
    regional.write_text(
        f"---\n{regional_frontmatter}---\n{regional_body}",
        encoding="utf-8",
    )

    # README that should be excluded by file discovery
    readme = tmp_path / "README.md"
    readme.write_text("# legalize-es\n", encoding="utf-8")

    return tmp_path
