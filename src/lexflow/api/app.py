"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from lexflow import __version__
from lexflow.api.error_handlers import register_error_handlers
from lexflow.api.middleware import RequestIdMiddleware
from lexflow.api.routers import (
    articles,
    chat_threads,
    dashboards,
    laws,
    mcp_servers,
    models,
    search,
    sync,
    system,
    tags,
    telemetry,
    versions,
)
from lexflow.api.routers.graph import router as graph_router
from lexflow.api.spa import mount_spa
from lexflow.api.warmup import schedule_background_warmup
from lexflow.chat.db import init_db
from lexflow.core.exceptions import LexFlowError
from lexflow.core.registry import get_registry
from lexflow.utils.logging_config import configure_logging

# Configure logging FIRST, before any module-level logger captures a
# pre-handler reference. Idempotent — safe to call again under pytest's
# reimport behaviour.
configure_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup / shutdown lifecycle (#222).

    Three-tier loading:

    1. **Eager** (here, before ``yield``): cheap and obligatory work —
       chat DB schema + registry filesystem index. Both finish in <1 s
       on the 12 K-law corpus so the server is ready to accept requests
       almost immediately.
    2. **Background** (scheduled, runs concurrent with serving): metadata
       preload, search index build, graph cache load/rebuild. Each
       stage flips a flag on the :class:`~lexflow.api.warmup.WarmupState`
       so the SPA's `/api/v1/system/warmup` poll can render specific
       hints in the loading UI instead of an opaque spinner.
    3. **Lazy** (on demand, unchanged): individual law full parse,
       per-call subgraph compute.
    """
    logger.info("LexFlow %s starting up", __version__)
    # Eager #1 — chat persistence. Idempotent ``create_all`` on the
    # SQLite tables. Tests that need a custom DB path use
    # ``init_db_for_path`` from a fixture instead.
    init_db()

    # Eager #2 + background warm-up. Skipped under
    # ``LEXFLOW_SKIP_EAGER_INDEX=1`` so unit tests that override DI don't
    # pay the cost.
    warmup_task: asyncio.Task[None] | None = None
    if os.environ.get("LEXFLOW_SKIP_EAGER_INDEX") != "1":
        try:
            # Filesystem scan only — populates ``identifier -> path`` (~1 s
            # for 12 K files). No YAML parsing yet, that's the background.
            get_registry()
        except (OSError, LexFlowError):
            # Misconfigured data path / missing submodule. Log and
            # continue so endpoints surface a 500 with a useful body
            # instead of failing at lifespan time.
            logger.exception("Eager registry index failed; routes will lazy-load")

        warmup_task = schedule_background_warmup()

    try:
        yield
    finally:
        if warmup_task is not None and not warmup_task.done():
            warmup_task.cancel()
            try:
                await warmup_task
            except asyncio.CancelledError:
                # Expected — cancellation is the happy path on shutdown.
                pass
            except Exception:
                logger.exception("Warmup task raised during shutdown cancel")
        logger.info("LexFlow shutting down")


app = FastAPI(
    title="LexFlow API",
    description="REST API for exploring, querying and analyzing Spanish legislation.",
    version=__version__,
    lifespan=lifespan,
)

# Request-id correlation + access logging (#92). MUST be added BEFORE
# error handlers so a 5xx still carries the request-id in the response.
app.add_middleware(RequestIdMiddleware)
register_error_handlers(app)
# Search MUST be registered before the laws router: its canonical route is
# `/laws/search`, and the laws router's `/laws/{law_id}` would otherwise
# greedily match "search" as a law id and 404 before search ever runs (#102).
app.include_router(search.router, prefix="/api/v1")
app.include_router(laws.router, prefix="/api/v1")
app.include_router(articles.router, prefix="/api/v1")
app.include_router(versions.router, prefix="/api/v1")
app.include_router(graph_router, prefix="/api/v1")
app.include_router(models.router, prefix="/api/v1")
app.include_router(chat_threads.router, prefix="/api/v1")
app.include_router(dashboards.router, prefix="/api/v1")
app.include_router(sync.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(mcp_servers.router, prefix="/api/v1")
app.include_router(telemetry.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "version": __version__}


# SPA mount — must come last so /api/v1/* and /health are never shadowed.
# No-op when frontend/dist/ is absent (dev mode, CI, unit tests).
mount_spa(app)
