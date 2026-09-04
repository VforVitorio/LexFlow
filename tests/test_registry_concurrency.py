"""Concurrency tests for LawRegistry per-law parse locking (#871 S1.3).

``_ensure_parsed`` used to hold the GLOBAL registry lock for the whole
``parse_law_file`` call, so two users opening different cold laws
serialised behind each other, and ``law_ids`` blocked on any in-flight
cold parse. These tests prove the per-law lock refactor fixed both.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path
from textwrap import dedent
from unittest.mock import patch

from lexflow.core import registry as registry_module
from lexflow.core.parser import parse_law_file
from lexflow.core.registry import LawRegistry


def _write_law(data_path: Path, law_id: str, title: str) -> None:
    """Write a minimal valid law file under ``es/`` in *data_path*."""
    frontmatter = dedent(f"""\
        title: "{title}"
        identifier: "{law_id}"
        country: "es"
        rank: "ley"
        status: "in_force"
        scope: "Estatal"
    """)
    body = f"# {title}\n\n##### Articulo 1.\n\nTexto del {law_id}.\n"
    path = data_path / "es" / f"{law_id}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{frontmatter}---\n{body}", encoding="utf-8")


def _slow_parse_law_file(path: Path, *, delay: float = 0.2):
    """Wrap ``parse_law_file`` with an artificial delay to widen the race window."""
    time.sleep(delay)
    return parse_law_file(path)


class TestPerLawParseLocking:
    def test_different_laws_parse_concurrently(self, tmp_path: Path) -> None:
        """Two cold laws must NOT serialise behind the global lock."""
        _write_law(tmp_path, "BOE-A-2000-1", "Ley Uno")
        _write_law(tmp_path, "BOE-A-2000-2", "Ley Dos")
        registry = LawRegistry(tmp_path)

        with patch.object(registry_module, "parse_law_file", side_effect=_slow_parse_law_file):
            start = time.monotonic()
            threads = [
                threading.Thread(target=registry.get_law, args=(law_id,)) for law_id in ("BOE-A-2000-1", "BOE-A-2000-2")
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
            elapsed = time.monotonic() - start

        # Serialised behind the old global lock: ~0.4s. Parallel: ~0.2s.
        assert elapsed < 0.35
        assert "BOE-A-2000-1" in registry._cache
        assert "BOE-A-2000-2" in registry._cache

    def test_law_ids_not_blocked_by_inflight_cold_parse(self, tmp_path: Path) -> None:
        """``law_ids`` must not block on a slow parse of an unrelated law."""
        _write_law(tmp_path, "BOE-A-2000-1", "Ley Uno")
        registry = LawRegistry(tmp_path)

        with patch.object(registry_module, "parse_law_file", side_effect=_slow_parse_law_file):
            parse_thread = threading.Thread(target=registry.get_law, args=("BOE-A-2000-1",))
            parse_thread.start()
            time.sleep(0.05)  # let the parse actually be in flight

            start = time.monotonic()
            ids = registry.law_ids
            elapsed = time.monotonic() - start

            parse_thread.join()

        assert ids == ["BOE-A-2000-1"]
        assert elapsed < 0.1

    def test_same_law_race_serialises_and_parses_once(self, tmp_path: Path) -> None:
        """Two threads racing on the SAME cold law parse exactly once."""
        _write_law(tmp_path, "BOE-A-2000-1", "Ley Uno")
        registry = LawRegistry(tmp_path)
        call_count = 0
        real_parse = parse_law_file

        def _counting_parse(path: Path):
            nonlocal call_count
            call_count += 1
            time.sleep(0.1)
            return real_parse(path)

        with patch.object(registry_module, "parse_law_file", side_effect=_counting_parse):
            threads = [threading.Thread(target=registry.get_law, args=("BOE-A-2000-1",)) for _ in range(3)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

        assert call_count == 1
