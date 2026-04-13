"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from lexflow import __version__
from lexflow.api.error_handlers import register_error_handlers
from lexflow.api.routers import articles, laws, search, versions
from lexflow.api.routers.graph import router as graph_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup / shutdown lifecycle."""
    logger.info("LexFlow %s starting up", __version__)
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
app.include_router(laws.router, prefix="/api/v1")
app.include_router(articles.router, prefix="/api/v1")
app.include_router(versions.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(graph_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "version": __version__}
