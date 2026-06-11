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


class TestFileLogCache:
    """#553 — `git log --follow` is cached per (path, max_count, HEAD)."""

    def _reader(self):
        return GitHistoryReader.__new__(GitHistoryReader)

    def test_repeat_calls_hit_cache_and_skip_git_log(self, monkeypatch) -> None:
        import lexflow.core.git_history as gh

        gh._FILE_LOG_CACHE.clear()
        reader = self._reader()
        log_calls = {"n": 0}

        def fake_run_git(*args: str) -> str:
            if args[0] == "rev-parse":
                return "HEAD_SHA_A\n"
            if args[0] == "log":
                log_calls["n"] += 1
                return "abc123\n2024-01-01T00:00:00+00:00\nReforma\ncuerpo\n---LEXFLOW-SEP---\n"
            return ""

        monkeypatch.setattr(reader, "_run_git", fake_run_git)
        first = reader.get_file_log("es/X.md", max_count=50)
        second = reader.get_file_log("es/X.md", max_count=50)
        # The second call is served from cache — same list object, no git log.
        assert second is first
        assert log_calls["n"] == 1

    def test_new_head_invalidates_cache(self, monkeypatch) -> None:
        import lexflow.core.git_history as gh

        gh._FILE_LOG_CACHE.clear()
        reader = self._reader()
        heads = ["HEAD_A\n", "HEAD_A\n", "HEAD_B\n"]
        log_calls = {"n": 0}

        def fake_run_git(*args: str) -> str:
            if args[0] == "rev-parse":
                return heads.pop(0) if heads else "HEAD_B\n"
            if args[0] == "log":
                log_calls["n"] += 1
                return "abc\n2024-01-01T00:00:00+00:00\nReforma\ncuerpo\n---LEXFLOW-SEP---\n"
            return ""

        monkeypatch.setattr(reader, "_run_git", fake_run_git)
        reader.get_file_log("es/X.md")  # HEAD_A → git log (1)
        reader.get_file_log("es/X.md")  # HEAD_A → cache hit
        reader.get_file_log("es/X.md")  # HEAD_B → re-run git log (2)
        assert log_calls["n"] == 2
