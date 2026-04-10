"""Tests for the in-memory search engine."""

from __future__ import annotations

from lexflow.core.search import SearchIndex, _extract_snippet


class TestSearchIndex:
    def _build_index(self) -> SearchIndex:
        idx = SearchIndex()
        idx.add_entry(
            law_id="BOE-A-2000-323",
            law_title="Ley de Enjuiciamiento Civil",
            article_number=None,
            text="Ley de Enjuiciamiento Civil",
        )
        idx.add_entry(
            law_id="BOE-A-2000-323",
            law_title="Ley de Enjuiciamiento Civil",
            article_number="1",
            text="En los procesos civiles, los tribunales deberan actuar con arreglo a la ley.",
        )
        idx.add_entry(
            law_id="BOE-A-2018-16673",
            law_title="Ley Organica de Proteccion de Datos",
            article_number="1",
            text="La presente ley tiene por objeto garantizar los derechos digitales.",
        )
        idx.mark_built()
        return idx

    def test_finds_matching_title(self) -> None:
        idx = self._build_index()
        result = idx.search("Enjuiciamiento")
        assert result.total > 0
        assert any(r.law_id == "BOE-A-2000-323" for r in result.items)

    def test_finds_matching_article(self) -> None:
        idx = self._build_index()
        result = idx.search("procesos civiles")
        assert result.total > 0
        assert result.items[0].article_number == "1"

    def test_returns_empty_for_no_match(self) -> None:
        idx = self._build_index()
        result = idx.search("xyznonexistent")
        assert result.total == 0
        assert result.items == []

    def test_case_insensitive(self) -> None:
        idx = self._build_index()
        result = idx.search("ENJUICIAMIENTO")
        assert result.total > 0

    def test_title_boost_ranking(self) -> None:
        idx = self._build_index()
        # "Enjuiciamiento" appears in title and article text
        result = idx.search("Enjuiciamiento")
        # Title match should score higher
        assert result.items[0].article_number is None  # law-level entry

    def test_pagination(self) -> None:
        idx = self._build_index()
        result = idx.search("ley", page=1, page_size=1)
        assert len(result.items) == 1
        assert result.total > 1

    def test_snippet_has_context(self) -> None:
        idx = self._build_index()
        result = idx.search("tribunales")
        assert result.total > 0
        assert "tribunales" in result.items[0].snippet.lower()


class TestExtractSnippet:
    def test_basic(self) -> None:
        text = "En los procesos civiles, los tribunales deberan actuar con arreglo a la ley."
        snippet = _extract_snippet(text, "tribunales")
        assert "tribunales" in snippet.lower()

    def test_no_match_returns_start(self) -> None:
        text = "Some text without the query."
        snippet = _extract_snippet(text, "zzz")
        assert len(snippet) > 0
