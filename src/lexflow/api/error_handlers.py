"""Global exception handlers for the FastAPI application.

Every handler emits FastAPI's default ``{"detail": "<message>"}`` shape so the
React frontend's single ``ApiError.detail`` reader (see
``frontend/src/lib/api.ts``) works uniformly across every 4xx/5xx. The
``code`` field is added alongside ``detail`` so a future client can branch on
the exception kind without parsing the message; today's frontend only reads
``detail``.

Path disclosure policy (audit #409): ``ParserError`` and
``DataPathError`` carry absolute filesystem paths (and, by extension,
the OS username) in their string form. We log the full message
server-side for operators but send a static, non-leaking detail to the
client. The exception ``code`` lets the SPA branch deterministically
without parsing the message.

--- WHERE TO CHANGE IF X CHANGES ---
Error envelope shape  → this file (keep ``detail`` always)
Frontend reader       → ``frontend/src/lib/api.ts::ApiError.detail``
Documented contract   → CLAUDE.md §6 "FastAPI ↔ React contract"
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from lexflow.core.exceptions import (
    ArticleNotFoundError,
    DataPathError,
    LawNotFoundError,
    ParserError,
)

logger = logging.getLogger(__name__)


def _envelope(status_code: int, code: str, message: str) -> JSONResponse:
    """Build the canonical error envelope: ``{"detail", "code"}``."""
    return JSONResponse(status_code=status_code, content={"detail": message, "code": code})


def register_error_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on *app*."""

    @app.exception_handler(LawNotFoundError)
    async def _law_not_found(_request: Request, exc: LawNotFoundError) -> JSONResponse:
        # Law id is request-controlled (URL segment); echoing it is fine.
        return _envelope(404, "law_not_found", str(exc))

    @app.exception_handler(ArticleNotFoundError)
    async def _article_not_found(_request: Request, exc: ArticleNotFoundError) -> JSONResponse:
        # Article number is request-controlled; same rationale.
        return _envelope(404, "article_not_found", str(exc))

    @app.exception_handler(ParserError)
    async def _parser_error(_request: Request, exc: ParserError) -> JSONResponse:
        # ``str(exc)`` would contain the absolute file path + OS
        # username. Log server-side; return a static detail so the
        # response body never doubles as recon for traversal.
        # CodeQL py/log-injection — explicit ``repr()``.
        logger.error("Parser error in %s: %s", repr(exc.file_path), repr(exc.reason))
        return _envelope(
            500,
            "parser_error",
            "Failed to parse a law file. See server logs for the file path.",
        )

    @app.exception_handler(DataPathError)
    async def _data_path_error(_request: Request, exc: DataPathError) -> JSONResponse:
        logger.error("Data directory unavailable: %s", repr(exc.path))
        return _envelope(
            503,
            "data_unavailable",
            "Legal corpus directory is not available. See server logs for details.",
        )
