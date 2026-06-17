"""Background warm-up orchestration for the LexFlow API (#222).

Splits startup work into three tiers so the server can accept requests
*immediately* and run heavy work in the background:

* **Eager** — runs inside :func:`lexflow.api.app.lifespan` before the
  ``yield``. Today: :func:`init_db` (SQLite ``create_all``) and the
  :class:`~lexflow.core.registry.LawRegistry` filesystem scan (~1 s for
  12 K filenames). Both are obligatory and cheap.
* **Background** — kicked off by :func:`schedule_background_warmup`
  *after* ``yield``, so the server is serving requests while these run:

  1. Full metadata preload (10-30 s on 12 K laws).
  2. In-memory search index build (10-30 s, depends on metadata).
  3. Graph build/load (sub-second if cache hits; 30-90 s cold).
  4. Semantic index build/load (opt-in; cache-hydrate when warm, else a
     full embed pass — minutes for the real model on first run, #548).
     Best-effort: a missing/failed embedder is logged and skipped, never
     fails the core warm-up.

* **Lazy on demand** — individual law full parse + per-call subgraph
  enrichment. Unchanged.

Public surface:

* :class:`WarmupState` — read-only snapshot of background-task progress.
* :func:`get_warmup_state` — process-wide singleton accessor.
* :func:`schedule_background_warmup` — called from the lifespan; spawns
  the warm-up coroutine and returns the :class:`asyncio.Task` so the
  caller can cancel it on shutdown.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new warm-up step  → extend :class:`WarmupState` with a flag,
                            add a stage to :func:`_run_warmup`, and
                            surface the flag in the
                            ``/api/v1/system/warmup`` response.
* Change ordering         → re-order the awaits in :func:`_run_warmup`.
                            Dependencies: ``search`` requires metadata.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field

from lexflow.api.dependencies import get_graph, get_law_registry
from lexflow.core.exceptions import LexFlowError
from lexflow.core.metadata_cache import load_or_preload_metadata
from lexflow.core.search_cache import load_or_build_search
from lexflow.search.service import ensure_semantic_index
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class WarmupState:
    """Process-wide warm-up progress snapshot.

    Updated by :func:`_run_warmup` under :data:`_state_lock`; read freely
    elsewhere — Python pointer assignment is atomic and the cost of a
    lock on every read of a bool would dwarf the work it protects.

    The ``ready`` property is derived so adding a new flag only needs
    one line in :meth:`is_fully_ready` + the new field.
    """

    metadata_ready: bool = False
    search_ready: bool = False
    graph_ready: bool = False
    semantic_ready: bool = False
    error: str | None = None
    started_at: float | None = None
    completed_at: float | None = None
    durations_seconds: dict[str, float] = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        """Core warm-up complete (metadata + search + graph).

        Excludes the opt-in semantic stage on purpose: browse, full-text
        and graph work without it, so a missing/failed embedder must not
        keep the app reporting "not ready" (#548). ``semantic_ready`` is
        surfaced separately.
        """
        return self.metadata_ready and self.search_ready and self.graph_ready


_state = WarmupState()
_state_lock = threading.Lock()


def get_warmup_state() -> WarmupState:
    """Return the process-wide :class:`WarmupState` singleton."""
    return _state


def _mark(stage: str, *, started: float) -> None:
    """Record stage completion + duration. Lock-protected for write parity."""
    elapsed = time.monotonic() - started
    with _state_lock:
        _state.durations_seconds[stage] = round(elapsed, 3)


async def _run_warmup() -> None:
    """Run the background warm-up sequence end-to-end.

    Stages run in order because the search index depends on metadata
    being preloaded. The graph build is independent and could run in
    parallel, but the perceived latency budget is fine sequentially —
    keeping it serial avoids fighting the registry's lock during the
    metadata pass.
    """
    overall_started = time.monotonic()
    with _state_lock:
        _state.started_at = overall_started
        _state.error = None

    data_path = get_settings().data_path

    try:
        # Stage 1 — metadata. Loads the on-disk cache (<1 s) when the corpus
        # revision matches; otherwise parses every law's frontmatter (10-30 s)
        # and persists the result for the next launch (#231).
        stage_started = time.monotonic()
        registry = get_law_registry()
        await asyncio.to_thread(load_or_preload_metadata, registry, data_path)
        with _state_lock:
            _state.metadata_ready = True
        _mark("metadata", started=stage_started)
        logger.info("Warmup: metadata stage complete (%.2fs)", time.monotonic() - stage_started)

        # Stage 2 — search index. Same load-or-build-then-persist pattern;
        # depends on metadata being present, hence the ordering (#231).
        stage_started = time.monotonic()
        await asyncio.to_thread(load_or_build_search, registry, data_path)
        with _state_lock:
            _state.search_ready = True
        _mark("search", started=stage_started)
        logger.info("Warmup: search index stage complete (%.2fs)", time.monotonic() - stage_started)

        # Stage 3 — graph. ``get_graph`` itself decides cache vs rebuild;
        # we run inside ``to_thread`` so the cold path doesn't block the
        # event loop and the warm path is just dict lookup overhead.
        stage_started = time.monotonic()
        await asyncio.to_thread(get_graph, registry)
        with _state_lock:
            _state.graph_ready = True
        _mark("graph", started=stage_started)
        logger.info("Warmup: graph stage complete (%.2fs)", time.monotonic() - stage_started)

        # Stage 4 — semantic index (opt-in). Pre-build so the first
        # semantic/hybrid query doesn't trigger a multi-minute cold embed
        # pass (#548). Best-effort and isolated in its own try/except: the
        # [semantic] extra may be absent or the model may fail to load, and
        # that must not fail the core warm-up or flip ``ready`` — browse,
        # full-text and graph work without it.
        stage_started = time.monotonic()
        try:
            await asyncio.to_thread(ensure_semantic_index, registry)
            with _state_lock:
                _state.semantic_ready = True
            _mark("semantic", started=stage_started)
            logger.info("Warmup: semantic index stage complete (%.2fs)", time.monotonic() - stage_started)
        # Embedder import/model-load failures span ImportError/RuntimeError
        # on top of the usual I/O + data errors; swallow them (opt-in feature).
        except (OSError, ValueError, LexFlowError, RuntimeError, ImportError):
            logger.warning("Warmup: semantic index pre-build skipped/failed", exc_info=True)

    # ``preload_all_metadata`` and ``search_text`` can raise on bad data;
    # ``get_graph`` can raise on submodule misconfiguration. Capture the
    # message so /system/warmup can surface it instead of failing silently.
    except (OSError, ValueError, LexFlowError) as exc:
        logger.exception("Warmup failed")
        with _state_lock:
            _state.error = str(exc)
    finally:
        with _state_lock:
            _state.completed_at = time.monotonic()
        logger.info("Warmup finished in %.2fs", time.monotonic() - overall_started)


def schedule_background_warmup() -> asyncio.Task[None]:
    """Spawn :func:`_run_warmup` as a background task, returning the task.

    Caller is responsible for cancelling on shutdown — the lifespan
    context manager does that via ``task.cancel()`` after ``yield``.
    """
    return asyncio.create_task(_run_warmup())


def reset_warmup_state() -> None:
    """Drop the warm-up flags so a test or a hot reload can re-warm.

    Tests that hit the warm-up endpoint should call this in a fixture
    so they don't see leakage from an earlier test's run.
    """
    global _state
    with _state_lock:
        _state = WarmupState()
