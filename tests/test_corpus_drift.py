"""Tests for the corpus drift report (#825 Sprint 4)."""

from __future__ import annotations

from pathlib import Path

import pytest

from lexflow.core.corpus_drift import compute_drift_report
from lexflow.core.registry import LawRegistry
from lexflow.graph import cache as graph_cache


class TestComputeDriftReport:
    def test_clean_corpus_reports_zero_drift(self, sample_law_dir: Path) -> None:
        registry = LawRegistry(sample_law_dir)
        report = compute_drift_report(registry)

        assert report.total_laws == 2
        assert report.unknown_status_count == 0
        assert report.empty_identifier_count == 0

    def test_unknown_status_value_is_counted(self, tmp_path: Path) -> None:
        law_path = tmp_path / "es" / "BOE-A-2099-1.md"
        law_path.parent.mkdir(parents=True, exist_ok=True)
        law_path.write_text(
            '---\nidentifier: "BOE-A-2099-1"\ntitle: "Test"\nstatus: "not_a_real_status"\n---\n# Test\n',
            encoding="utf-8",
        )
        registry = LawRegistry(tmp_path)
        report = compute_drift_report(registry)

        assert report.unknown_status_count == 1
        assert report.unknown_status_sample_ids == ["BOE-A-2099-1"]

    def test_zero_article_law_counted_even_when_not_yet_parsed(self, tmp_path: Path) -> None:
        """Regression (#825 review): must not undercount to 0 on a fresh registry.

        Before the fix, ``compute_drift_report`` gated the zero-article
        check on ``registry.is_parsed(law_id)``, so a law never appeared
        in ``zero_article_count`` unless something else had already fully
        parsed it into ``LawRegistry._cache`` — which a warm-cache-hit
        ``get_graph`` never does.
        """
        law_path = tmp_path / "es" / "BOE-A-2099-2.md"
        law_path.parent.mkdir(parents=True, exist_ok=True)
        law_path.write_text(
            '---\nidentifier: "BOE-A-2099-2"\ntitle: "Empty law"\n---\n# Empty law\n\nJust prose, no articles.\n',
            encoding="utf-8",
        )
        registry = LawRegistry(tmp_path)
        assert not registry.is_parsed("BOE-A-2099-2")

        report = compute_drift_report(registry)

        assert report.zero_article_count == 1
        assert report.zero_article_sample_ids == ["BOE-A-2099-2"]

    def test_zero_article_law_counted_when_graph_cache_hit_skips_parsing(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Simulates the exact bug path: ``get_graph`` returns a cached graph.

        ``load_or_build`` (``graph/cache.py``) on a corpus-hash match returns
        the graph deserialized from ``graph_cache.json`` directly, without
        ever calling ``build_graph(registry)`` — so ``LawRegistry._cache``
        stays empty for every law, exactly like a warm restart hitting the
        disk cache. The drift stage must still see the real article count.
        """
        # ``graph_cache.json`` lands at ``data_path.parent``, so nest the
        # corpus one level under ``tmp_path`` to keep the cache file scoped
        # to this test instead of leaking into a shared parent directory.
        data_path = tmp_path / "corpus"
        law_path = data_path / "es" / "BOE-A-2099-2.md"
        law_path.parent.mkdir(parents=True, exist_ok=True)
        law_path.write_text(
            '---\nidentifier: "BOE-A-2099-2"\ntitle: "Empty law"\n---\n# Empty law\n\nJust prose, no articles.\n',
            encoding="utf-8",
        )
        monkeypatch.setattr(graph_cache, "submodule_hash", lambda data_path: "fixed-revision")

        priming_registry = LawRegistry(data_path)
        graph = graph_cache.load_or_build(priming_registry, data_path)
        assert priming_registry.is_parsed("BOE-A-2099-2")  # cold build parsed it

        registry = LawRegistry(data_path)
        cached_graph = graph_cache.load_or_build(registry, data_path)
        assert cached_graph.node_count() == graph.node_count()
        assert registry.is_parsed("BOE-A-2099-2") is False  # cache hit never touched _cache

        report = compute_drift_report(registry)

        assert report.zero_article_count == 1
        assert report.zero_article_sample_ids == ["BOE-A-2099-2"]

    def test_missing_identifier_is_counted(self, tmp_path: Path) -> None:
        law_path = tmp_path / "es" / "BOE-A-2099-3.md"
        law_path.parent.mkdir(parents=True, exist_ok=True)
        law_path.write_text(
            '---\ntitle: "No identifier"\n---\n# No identifier\n',
            encoding="utf-8",
        )
        registry = LawRegistry(tmp_path)
        report = compute_drift_report(registry)

        assert report.empty_identifier_count == 1
        assert report.empty_identifier_sample_ids == ["BOE-A-2099-3"]
