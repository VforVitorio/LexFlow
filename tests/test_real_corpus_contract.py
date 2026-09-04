"""Real-corpus contract tests (#573) — run against the ACTUAL legalize-es.

These exist because the mock fixtures used 5-hash article headings while the
real corpus uses 6 (``######``), so ``extract_articles`` returned ``[]`` for
*every* real law and CI stayed green (#561). A fixture can silently drift from
reality; the real corpus can't. They assert **content** (article counts, real
body text), not just HTTP status.

Skipped (not failed) when the submodule isn't checked out, so a shallow CI job
without the corpus still passes; the real-corpus job runs them for real.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from lexflow.api.app import app
from lexflow.api.dependencies import get_law_registry
from lexflow.core.corpus_drift import compute_drift_report
from lexflow.core.enums import ReferenceKind
from lexflow.core.registry import LawRegistry
from lexflow.core.services import find_article

CORPUS_PATH = Path(__file__).resolve().parent.parent / "data" / "legalize-es"

# The Constitución Española — the canonical 169-article law. The exact count is
# a deliberate golden value: if a parser change ever drops articles (the #561
# class), this flips red.
CONSTITUTION_ID = "BOE-A-1978-31229"
CONSTITUTION_ARTICLES = 169

# Well-known laws that MUST parse to a non-empty article list. Lower bounds
# (not exact) so consolidations don't make them brittle — the point is to catch
# "0 articles", not to pin every count.
KNOWN_LAWS_MIN_ARTICLES = [
    (CONSTITUTION_ID, 160),
    ("BOE-A-1889-4763", 1),  # Código Civil
    ("BOE-A-1995-25444", 1),  # Código Penal
]


def _corpus_or_skip() -> Path:
    if not (CORPUS_PATH / "es").is_dir():
        pytest.skip("legalize-es corpus not checked out")
    return CORPUS_PATH


@pytest.fixture(scope="module")
def real_registry() -> LawRegistry:
    """A registry backed by the real corpus (index only; laws parse lazily)."""
    return LawRegistry(_corpus_or_skip())


@pytest.fixture()
def real_client(real_registry: LawRegistry) -> Iterator[TestClient]:
    """A TestClient whose law registry is the real corpus, not a fixture."""
    app.dependency_overrides[get_law_registry] = lambda: real_registry
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


class TestConstitutionContract:
    """Parse the real Constitution and assert it actually came out whole."""

    def test_parses_to_exactly_169_articles(self, real_registry: LawRegistry) -> None:
        law = real_registry.get_law(CONSTITUTION_ID)
        assert law.article_count == CONSTITUTION_ARTICLES
        # The count must match the actual list — guards the 958-duplication
        # class where a derived count and the real list disagree.
        assert len(law.articles) == CONSTITUTION_ARTICLES

    def test_article_numbers_run_1_to_169(self, real_registry: LawRegistry) -> None:
        numbers = [a.number for a in real_registry.get_law(CONSTITUTION_ID).articles]
        assert numbers[0] == "1"
        assert numbers[-1] == "169"

    def test_article_14_has_real_body_text(self, real_registry: LawRegistry) -> None:
        law = real_registry.get_law(CONSTITUTION_ID)
        article_14 = next((a for a in law.articles if a.number == "14"), None)
        assert article_14 is not None
        # The equality clause — proves we parsed body text, not just headings
        # (the original #561 bug left every article body empty).
        assert "iguales ante la ley" in article_14.text.lower()

    def test_section_tree_is_not_empty(self, real_registry: LawRegistry) -> None:
        law = real_registry.get_law(CONSTITUTION_ID)
        assert law.sections, "Constitution should parse a non-empty section tree"

    def test_parses_to_15_disposiciones_incl_one_derogatoria(self, real_registry: LawRegistry) -> None:
        """#823 AC: 169 articles + 15 disposiciones incl. exactly 1 derogatoria."""
        law = real_registry.get_law(CONSTITUTION_ID)
        assert len(law.disposiciones) == 15
        derogatorias = [d for d in law.disposiciones if d.kind == "derogatoria"]
        assert len(derogatorias) == 1

    def test_article_169_text_is_exactly_the_boe_sentence(self, real_registry: LawRegistry) -> None:
        """#823 AC: art. 169's body must be exactly the single BOE sentence.

        Before #823, ``_SECTION_BREAK_RE`` only matched heading levels 1-4,
        so the trailing level-5/6 non-article headings after the last
        article leaked into its body.
        """
        law = real_registry.get_law(CONSTITUTION_ID)
        article_169 = next(a for a in law.articles if a.number == "169")
        assert article_169.text == (
            "No podrá iniciarse la reforma constitucional en tiempo de guerra "
            "o de vigencia de alguno de los estados previstos en el artículo 116."
        )


class TestKnownLawsHaveContent:
    @pytest.mark.parametrize("law_id, min_articles", KNOWN_LAWS_MIN_ARTICLES)
    def test_law_parses_with_non_empty_articles(
        self, real_registry: LawRegistry, law_id: str, min_articles: int
    ) -> None:
        if not real_registry.has_law(law_id):
            pytest.skip(f"{law_id} not present in this corpus snapshot")
        law = real_registry.get_law(law_id)
        assert law.article_count >= min_articles
        assert law.article_count == len(law.articles)
        # Every article must carry real body text — catches "headings parsed,
        # bodies empty".
        assert all(article.text.strip() for article in law.articles)


class TestConstitutionEndpointContract:
    """The same guarantee, but through the HTTP layer (content, not just 200)."""

    def test_law_endpoint_returns_169_articles(self, real_client: TestClient) -> None:
        response = real_client.get(f"/api/v1/laws/{CONSTITUTION_ID}")
        assert response.status_code == 200
        body = response.json()
        assert body["article_count"] == CONSTITUTION_ARTICLES
        assert len(body["articles"]) == CONSTITUTION_ARTICLES
        assert body["articles"][0]["text"].strip()


# Ley 39/2015 — the AC law for #822. Its article headings carry titles
# (``###### Artículo 1. Objeto de la Ley.``), which used to land whole in
# ``number`` and break lookup by the bare number.
LPAC_ID = "BOE-A-2015-10565"


class TestTitledArticleContract:
    """#822 AC: number/title split must hold on real titled headings."""

    def test_first_article_number_and_title(self, real_registry: LawRegistry) -> None:
        law = real_registry.get_law(LPAC_ID)
        assert law.articles[0].number == "1"
        assert law.articles[0].title == "Objeto de la Ley"

    def test_article_endpoint_finds_bare_number(self, real_client: TestClient) -> None:
        response = real_client.get(f"/api/v1/laws/{LPAC_ID}/articles/1")
        assert response.status_code == 200
        article = response.json()["article"]
        assert article["number"] == "1"
        assert article["title"] == "Objeto de la Ley"


class TestLpacDisposicionesContract:
    """#823 regression: Ley 39/2015's 15 derogatoria refs were mis-attributed
    to "art. 133" because disposiciones weren't extracted separately from the
    last article's body.
    """

    def test_disposiciones_parsed_non_empty(self, real_registry: LawRegistry) -> None:
        law = real_registry.get_law(LPAC_ID)
        assert len(law.disposiciones) == 22

    def test_last_article_body_has_no_disposicion_derived_references(self, real_registry: LawRegistry) -> None:
        law = real_registry.get_law(LPAC_ID)
        article_133 = next(a for a in law.articles if a.number == "133")
        derogatoria = next(d for d in law.disposiciones if d.kind == "derogatoria")
        assert derogatoria.references
        derogatoria_ref_texts = {r.target_text for r in derogatoria.references}
        article_133_ref_texts = {r.target_text for r in article_133.references}
        assert not derogatoria_ref_texts & article_133_ref_texts

    def test_article_133_text_does_not_contain_disposicion_derogatoria(self, real_registry: LawRegistry) -> None:
        """#823 AC: art. 133's body must not swallow the trailing disposicion."""
        law = real_registry.get_law(LPAC_ID)
        article_133 = next(a for a in law.articles if a.number == "133")
        assert "disposición derogatoria única" not in article_133.text.lower()

    def test_ley_30_1992_reference_attributed_to_derogatoria_not_article_133(self, real_registry: LawRegistry) -> None:
        """#823 AC: the Ley 30/1992 reference's source is the disposición, not art. 133."""
        law = real_registry.get_law(LPAC_ID)
        derogatoria = next(d for d in law.disposiciones if d.kind == "derogatoria")
        ley_30_1992_ref = next(r for r in derogatoria.references if "Ley 30/1992" in r.target_text)
        assert ley_30_1992_ref.source_article == "disposición derogatoria única"
        assert ley_30_1992_ref.source_article != "133"

    def test_ley_30_1992_reference_classified_as_repeals(self, real_registry: LawRegistry) -> None:
        """#823 AC: the Ley 30/1992 reference (list item "a)") must classify as repeals."""
        law = real_registry.get_law(LPAC_ID)
        derogatoria = next(d for d in law.disposiciones if d.kind == "derogatoria")
        ley_30_1992_ref = next(r for r in derogatoria.references if "Ley 30/1992" in r.target_text)
        assert ley_30_1992_ref.kind == ReferenceKind.REPEALS


# #824 Sprint 3 — article completeness: phantoms, ranges, zero-article, duplicates.
BEPS_ID = "BOE-A-2021-21097"
CODIGO_CIVIL_ID = "BOE-A-1889-4763"
INSTRUCCION_ID = "BOE-A-2026-7297"
DEMARCACION_ID = "BOE-A-2016-439"


class TestPhantomArticlesFixed:
    """AC: BOE-A-2021-21097 (BEPS) parses exactly 340 articles, not 1,573.

    The bug (hashless "Artículo N" body mentions counted as boundaries)
    inflated this specific law from 340 real headings to 1,573 parsed
    articles — the single clearest real-corpus proof of the phantom bug.
    """

    def test_parses_to_exactly_340_articles(self, real_registry: LawRegistry) -> None:
        if not real_registry.has_law(BEPS_ID):
            pytest.skip(f"{BEPS_ID} not present in this corpus snapshot")
        law = real_registry.get_law(BEPS_ID)
        assert law.article_count == 340


class TestArticleRangePlaceholders:
    """AC: find_article(CC, '330') returns the Ley 20/2011 derogation note."""

    def test_find_article_330_has_derogation_note(self, real_registry: LawRegistry) -> None:
        if not real_registry.has_law(CODIGO_CIVIL_ID):
            pytest.skip(f"{CODIGO_CIVIL_ID} not present in this corpus snapshot")
        law = real_registry.get_law(CODIGO_CIVIL_ID)
        article = find_article(law, "330")
        assert article is not None
        assert "Derogado" in article.text
        assert "Ley 20/2011" in article.text


class TestOrdinalDispositivosFixed:
    """AC: BOE-A-2026-7297 (article-less norm) yields article_count == 4."""

    def test_article_count_is_four(self, real_registry: LawRegistry) -> None:
        if not real_registry.has_law(INSTRUCCION_ID):
            pytest.skip(f"{INSTRUCCION_ID} not present in this corpus snapshot")
        law = real_registry.get_law(INSTRUCCION_ID)
        assert law.article_count == 4
        assert law.articles[0].number == "Primero"


class TestDuplicateArticleDisambiguation:
    """AC: both "Autoridades competentes" articles are retrievable distinctly."""

    def test_both_autoridades_competentes_articles_reachable(self, real_registry: LawRegistry) -> None:
        if not real_registry.has_law(DEMARCACION_ID):
            pytest.skip(f"{DEMARCACION_ID} not present in this corpus snapshot")
        law = real_registry.get_law(DEMARCACION_ID)
        first = find_article(law, "2", occurrence=1)
        second = find_article(law, "2", occurrence=2)
        assert first is not None
        assert second is not None
        assert first.text != second.text

    def test_endpoint_occurrence_param_disambiguates(self, real_client: TestClient) -> None:
        first = real_client.get(f"/api/v1/laws/{DEMARCACION_ID}/articles/2")
        second = real_client.get(
            f"/api/v1/laws/{DEMARCACION_ID}/articles/2",
            params={"occurrence": 2},
        )
        if first.status_code == 404:
            pytest.skip(f"{DEMARCACION_ID} not present in this corpus snapshot")
        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["article"]["text"] != second.json()["article"]["text"]


# #825 Sprint 4 — non-article prose (preámbulo, anexo) must be retrievable
# via the API and indexed for search. ANEXO_ID is a real law whose entire
# operative content is a data table with no Artículo headings at all.
ANEXO_ID = "BOE-A-1962-14073"


def _find_section(sections: list[dict], heading_substring: str) -> dict | None:
    for section in sections:
        if heading_substring in section["heading"]:
            return section
        found = _find_section(section["subsections"], heading_substring)
        if found:
            return found
    return None


class TestNonArticleProseContract:
    """#825 AC: Constitución PREÁMBULO + BOE-A-1962-14073 anexo table are
    retrievable via the API and indexed for search — not silently dropped.
    """

    def test_constitution_preambulo_retrievable_via_api(self, real_client: TestClient) -> None:
        response = real_client.get(f"/api/v1/laws/{CONSTITUTION_ID}")
        assert response.status_code == 200
        preambulo = _find_section(response.json()["sections"], "PREÁMBULO")
        assert preambulo is not None
        assert "La Nación española" in preambulo["text"]

    def test_anexo_table_retrievable_and_not_truncated(self, real_registry: LawRegistry) -> None:
        if not real_registry.has_law(ANEXO_ID):
            pytest.skip(f"{ANEXO_ID} not present in this corpus snapshot")
        law = real_registry.get_law(ANEXO_ID)
        anexo = _find_section(
            [s.model_dump() for s in law.sections],
            "ANEXO",
        )
        assert anexo is not None
        # First and last data rows of the table must both survive — proves
        # the whole table is kept, not just the head.
        assert "1.111" in anexo["text"]
        assert "2.27" in anexo["text"]

    def test_search_finds_term_only_present_in_preambulo(self, real_registry: LawRegistry) -> None:
        real_registry.get_law(CONSTITUTION_ID)
        result = real_registry.search_text("convivencia democrática")
        assert result.total > 0
        assert any(r.law_id == CONSTITUTION_ID for r in result.items)

    def test_search_finds_term_only_present_in_anexo_table(self, real_registry: LawRegistry) -> None:
        if not real_registry.has_law(ANEXO_ID):
            pytest.skip(f"{ANEXO_ID} not present in this corpus snapshot")
        real_registry.get_law(ANEXO_ID)
        result = real_registry.search_text("Espartizal o atochar")
        assert result.total > 0
        assert any(r.law_id == ANEXO_ID for r in result.items)


class TestCorpusDriftReport:
    """#825 AC: report shows 0 empty identifiers (post-Sprint 1) on the real
    corpus, and correctly counts + samples the drift signals that do exist
    (e.g. ``annulled``/``expired`` status values not yet in ``LawStatus``,
    a separate enum-completeness gap this report surfaces but doesn't fix).
    """

    def test_empty_identifier_count_is_zero_on_real_corpus(self, real_registry: LawRegistry) -> None:
        report = compute_drift_report(real_registry)
        assert report.total_laws > 0
        assert report.empty_identifier_count == 0, report.empty_identifier_sample_ids

    def test_unknown_status_count_matches_sample_size_cap(self, real_registry: LawRegistry) -> None:
        report = compute_drift_report(real_registry)
        assert report.unknown_status_count >= len(report.unknown_status_sample_ids)
        assert len(report.unknown_status_sample_ids) <= 10
