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
    error: str | None = None
    started_at: float | None = None
    completed_at: float | None = None
    durations_seconds: dict[str, float] = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        """All warm-up stages complete."""
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

    try:
        # Stage 1 — metadata preload (parses YAML frontmatter of every law).
        stage_started = time.monotonic()
        registry = get_law_registry()
        await asyncio.to_thread(registry.preload_all_metadata)
        with _state_lock:
            _state.metadata_ready = True
        _mark("metadata", started=stage_started)
        logger.info("Warmup: metadata stage complete (%.2fs)", time.monotonic() - stage_started)

        # Stage 2 — search index. Implicit: built lazily by `search_text`,
        # which we trigger with a dummy query that matches nothing. Cheap
        # call into an established API beats reaching for a private method.
        stage_started = time.monotonic()
        await asyncio.to_thread(registry.search_text, "_warmup_zzz_no_match_", page=1, page_size=1)
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
