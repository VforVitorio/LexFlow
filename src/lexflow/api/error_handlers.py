"""Global exception handlers for the FastAPI application.

Every handler emits FastAPI's default ``{"detail": "<message>"}`` shape so the
React frontend's single ``ApiError.detail`` reader (see
``frontend/src/lib/api.ts``) works uniformly across every 4xx/5xx. The
``code`` field is added alongside ``detail`` so a future client can branch on
the exception kind without parsing the message; today's frontend only reads
``detail``.

--- WHERE TO CHANGE IF X CHANGES ---
Error envelope shape  → this file (keep ``detail`` always)
Frontend reader       → ``frontend/src/lib/api.ts::ApiError.detail``
Documented contract   → CLAUDE.md §6 "FastAPI ↔ React contract"
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from lexflow.core.exceptions import (
    ArticleNotFoundError,
    DataPathError,
    LawNotFoundError,
    ParserError,
)


def _envelope(status_code: int, code: str, message: str) -> JSONResponse:
    """Build the canonical error envelope: ``{"detail", "code"}``."""
    return JSONResponse(status_code=status_code, content={"detail": message, "code": code})


def register_error_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on *app*."""

    @app.exception_handler(LawNotFoundError)
    async def _law_not_found(_request: Request, exc: LawNotFoundError) -> JSONResponse:
        return _envelope(404, "law_not_found", str(exc))

    @app.exception_handler(ArticleNotFoundError)
    async def _article_not_found(_request: Request, exc: ArticleNotFoundError) -> JSONResponse:
        return _envelope(404, "article_not_found", str(exc))

    @app.exception_handler(ParserError)
    async def _parser_error(_request: Request, exc: ParserError) -> JSONResponse:
        return _envelope(500, "parser_error", str(exc))

    @app.exception_handler(DataPathError)
    async def _data_path_error(_request: Request, exc: DataPathError) -> JSONResponse:
        return _envelope(503, "data_unavailable", str(exc))
