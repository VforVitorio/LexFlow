"""CSRF boundary for spawn/state-changing routes (issue #885, S1.2).

LexFlow has no auth layer (single-user local app), and CORS stays off
on purpose (see ``CLAUDE.md`` §6) because the SPA and API share an
origin. That combination means the browser's *simple request* rules
are the only thing standing between a malicious third-party page and
a handful of routes that either mutate state expensively (``/sync``),
spawn subprocesses (``/mcp/tools`` lazily connects every enabled MCP
server), or start an installer (``/system/semantic-install``). A
bodyless ``POST``, a plain ``GET``, or a ``multipart/form-data`` upload
(``/mcp/bundles``) never triggers a CORS preflight, so a cross-origin
page can fire one blind.

This module closes that gap with a required custom header (the
option the issue calls out as sufficient on its own): any browser
request carrying a non-"simple" header value is forced through a
preflight, and since this app never installs ``CORSMiddleware`` /
never answers a preflight with ``Access-Control-Allow-Origin``, the
browser blocks the real request before it ever reaches us. The
``Origin`` allow-list is defense-in-depth on top of that — checked
only when the browser actually sends one.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new protected route  → extend :data:`PROTECTED_PATHS`.
* Header contract            → :class:`~lexflow.utils.config.Settings`
                                 (``csrf_header_name`` / ``_value``);
                                 the SPA-side counterpart lives in
                                 ``frontend/src/lib/api/http.ts``.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

# The browser-reachable subset flagged in issue #885: bodyless/simple
# requests that either spawn a subprocess, mutate corpus state, or
# start an installer. Exact ``path`` match (post-prefix routing has
# already resolved these to their canonical form).
PROTECTED_PATHS: frozenset[str] = frozenset(
    {
        "/api/v1/sync",
        "/api/v1/sync/run",
        "/api/v1/system/semantic-install",
        "/api/v1/mcp/tools",
        "/api/v1/mcp/bundles",
    }
)


def _is_protected(path: str) -> bool:
    """Return whether *path* needs the CSRF boundary check."""
    return path in PROTECTED_PATHS


def _origin_allowed(origin: str, allowed: tuple[str, ...]) -> bool:
    """Case-sensitive match against the configured allow-list.

    Origins are scheme+host+port; comparing verbatim (no normalisation)
    matches how browsers construct the header.
    """
    return origin in allowed


def _reject(code: str, message: str) -> Response:
    """Build the stable ``{detail: {code, message}}`` 403 shape."""
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": {"code": code, "message": message}},
    )


class CSRFBoundaryMiddleware(BaseHTTPMiddleware):
    """Reject cross-origin requests to :data:`PROTECTED_PATHS`.

    Two checks, both configurable via :class:`~lexflow.utils.config.Settings`:

    1. **Required header** (primary control) — the SPA must set
       ``csrf_header_name: csrf_header_value``. Missing or wrong value
       → 403. This is what actually stops the browser: setting a
       custom header forces a CORS preflight, and this app never
       answers one with an ``Access-Control-Allow-Origin``.
    2. **Origin allow-list** (defense-in-depth) — only enforced when
       the request carries an ``Origin`` header at all (same-origin
       browser fetches and non-browser tools typically don't).
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if not _is_protected(request.url.path):
            return await call_next(request)

        settings = get_settings()
        header_value = request.headers.get(settings.csrf_header_name)
        if header_value != settings.csrf_header_value:
            logger.warning(
                "CSRF boundary: rejected %s %s (missing/invalid %s header)",
                request.method,
                request.url.path,
                settings.csrf_header_name,
            )
            return _reject(
                "csrf_header_required",
                f"This endpoint requires the {settings.csrf_header_name!r} header.",
            )

        origin = request.headers.get("origin")
        if origin and not _origin_allowed(origin, settings.csrf_allowed_origins):
            logger.warning(
                "CSRF boundary: rejected %s %s (origin %r not allowed)",
                request.method,
                request.url.path,
                origin,
            )
            return _reject("csrf_origin_rejected", f"Origin {origin!r} is not allowed.")

        return await call_next(request)
