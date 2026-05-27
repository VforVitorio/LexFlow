"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from lexflow import __version__
from lexflow.api.error_handlers import register_error_handlers
from lexflow.api.routers import articles, chat_threads, dashboards, laws, models, search, sync, tags, versions
from lexflow.api.routers.graph import router as graph_router
from lexflow.chat.db import init_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup / shutdown lifecycle."""
    logger.info("LexFlow %s starting up", __version__)
    # Chat thread persistence (issue #83) — idempotent ``create_all`` on
    # the SQLite tables. Cheap, runs once per process. Tests that need a
    # custom DB path call ``init_db_for_path`` from a fixture instead.
    init_db()
    # Metadata preload is deferred to first request to avoid import-time
    # side effects during testing.  Production startup can call
    # ``get_registry().preload_all_metadata()`` explicitly.
    yield
    logger.info("LexFlow shutting down")


app = FastAPI(
    title="LexFlow API",
    description="REST API for exploring, querying and analyzing Spanish legislation.",
    version=__version__,
    lifespan=lifespan,
)

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
app.include_router(tags.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "version": __version__}
