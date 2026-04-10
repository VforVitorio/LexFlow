"""Global exception handlers for the FastAPI application."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from lexflow.core.exceptions import (
    ArticleNotFoundError,
    DataPathError,
    LawNotFoundError,
    ParserError,
)


def register_error_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on *app*."""

    @app.exception_handler(LawNotFoundError)
    async def _law_not_found(request: Request, exc: LawNotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={"error": "LawNotFound", "message": str(exc)},
        )

    @app.exception_handler(ArticleNotFoundError)
    async def _article_not_found(request: Request, exc: ArticleNotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={"error": "ArticleNotFound", "message": str(exc)},
        )

    @app.exception_handler(ParserError)
    async def _parser_error(request: Request, exc: ParserError) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"error": "ParserError", "message": str(exc)},
        )

    @app.exception_handler(DataPathError)
    async def _data_path_error(request: Request, exc: DataPathError) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={"error": "DataUnavailable", "message": str(exc)},
        )
