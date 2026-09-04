"""Tests for shared business-logic helpers (see ``core/services.py``)."""

from __future__ import annotations

from datetime import date

import pytest

from lexflow.core.models import Article, Law, LawMetadata
from lexflow.core.services import find_article


def _law_with_articles(numbers: list[str]) -> Law:
    articles = [Article(number=n, title=None, text=f"Texto {n}") for n in numbers]
    metadata = LawMetadata(identifier="TEST-1", title="Test", publication_date=date(2020, 1, 1))
    return Law(metadata=metadata, articles=articles, file_path="test.md")


class TestFindArticle:
    def test_default_returns_first_match(self) -> None:
        law = _law_with_articles(["1", "2", "2"])
        article = find_article(law, "2")
        assert article is not None
        assert article.text == "Texto 2"

    def test_occurrence_selects_duplicate(self) -> None:
        """#824: laws with embedded annex statutes repeat article numbers —
        ``occurrence`` reaches the 2nd (3rd, ...) match instead of always
        returning the first.
        """
        articles = [
            Article(number="2", title="Autoridades competentes", text="Primer anexo"),
            Article(number="2", title="Autoridades competentes", text="Segundo anexo"),
        ]
        metadata = LawMetadata(identifier="TEST-1", title="Test")
        law = Law(metadata=metadata, articles=articles, file_path="test.md")

        first = find_article(law, "2", occurrence=1)
        second = find_article(law, "2", occurrence=2)
        assert first is not None and first.text == "Primer anexo"
        assert second is not None and second.text == "Segundo anexo"

    def test_occurrence_beyond_matches_returns_none(self) -> None:
        law = _law_with_articles(["1", "2"])
        assert find_article(law, "2", occurrence=2) is None

    @pytest.mark.parametrize("occurrence", [0, -1])
    def test_non_positive_occurrence_returns_none(self, occurrence: int) -> None:
        law = _law_with_articles(["1"])
        assert find_article(law, "1", occurrence=occurrence) is None

    def test_no_match_returns_none(self) -> None:
        law = _law_with_articles(["1"])
        assert find_article(law, "999") is None

    def test_trailing_dot_still_matches(self) -> None:
        law = _law_with_articles(["1"])
        assert find_article(law, "1.") is not None
