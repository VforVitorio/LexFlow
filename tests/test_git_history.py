"""Tests for git history reader (unit tests with hardcoded data)."""

from __future__ import annotations

from lexflow.core.git_history import GitHistoryReader, _split_trailer_list


class TestParseTrailers:
    def test_extracts_norma(self) -> None:
        reader = GitHistoryReader.__new__(GitHistoryReader)
        trailers = reader._parse_trailers("Norma: BOE-A-2024-5678\nDisposición: BOE-A-2024-9999\nFecha: 2024-03-15\n")
        assert trailers["Norma"] == "BOE-A-2024-5678"
        assert trailers["Disposición"] == "BOE-A-2024-9999"

    def test_empty_body(self) -> None:
        reader = GitHistoryReader.__new__(GitHistoryReader)
        assert reader._parse_trailers("") == {}


class TestSplitTrailerList:
    def test_comma_separated(self) -> None:
        assert _split_trailer_list("art. 1, art. 2, art. 3") == ["art. 1", "art. 2", "art. 3"]

    def test_na_returns_empty(self) -> None:
        assert _split_trailer_list("N/A") == []

    def test_empty_returns_empty(self) -> None:
        assert _split_trailer_list("") == []


class TestParseDiffStats:
    def test_counts_additions_and_deletions(self) -> None:
        reader = GitHistoryReader.__new__(GitHistoryReader)
        diff = (
            "--- a/file.md\n"
            "+++ b/file.md\n"
            "@@ -1,3 +1,3 @@\n"
            "-old line 1\n"
            "-old line 2\n"
            "+new line 1\n"
            "+new line 2\n"
            "+new line 3\n"
        )
        stats = reader._parse_diff_stats(diff)
        assert stats.additions == 3
        assert stats.deletions == 2

    def test_detects_changed_articles(self) -> None:
        reader = GitHistoryReader.__new__(GitHistoryReader)
        diff = "+##### Artículo 1.\n+New text for article 1\n-##### Artículo 3.\n"
        stats = reader._parse_diff_stats(diff)
        assert "1" in stats.changed_articles
        assert "3" in stats.changed_articles
