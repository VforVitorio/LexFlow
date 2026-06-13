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
from lexflow.core.registry import LawRegistry

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
