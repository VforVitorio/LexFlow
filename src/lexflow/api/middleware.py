"""ASGI middleware — request id correlation + access log (#92).

Single middleware that:
  1. Reads (or generates) a UUID4 request id, binds it to
     ``request_id_var`` for the duration of the request so every log
     line emitted inside the request inherits it via the
     :class:`RequestIdFilter` installed in :mod:`logging_config`.
  2. Sets ``X-Request-Id`` on the response.
  3. Emits one ``access`` log line per request with the route, method,
     status, and duration in milliseconds.

Inbound ``X-Request-Id`` header is honoured if present (matches the
ingress / reverse-proxy convention) so log lines stay correlated
across hops. We validate the inbound shape to a hex32 to keep the
log attribute small and free of injection.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from lexflow.utils.logging_config import request_id_var

logger = logging.getLogger("lexflow.access")

# Accept the project's own UUID4 hex (32 chars no dashes) or the
# canonical hyphenated form; reject everything else so the log
# attribute is always recognisable. Long / malformed inputs fall
# through to a fresh UUID.
_VALID_REQUEST_ID_RE = re.compile(
    r"^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _resolve_request_id(inbound: str | None) -> str:
    """Pick a valid request id: inbound if it parses, else a fresh UUID4 hex."""
    if inbound and _VALID_REQUEST_ID_RE.match(inbound):
        return inbound
    return uuid.uuid4().hex


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Bind a request id + emit access logs.

    Skips ``/health`` so the once-a-second liveness probe doesn't drown
    the log. Static assets served by :mod:`api.spa` are kept (they're
    rare; useful to see in dev when CSP or path issues surface).
    """

    def __init__(self, app: ASGIApp, *, skip_paths: frozenset[str] = frozenset({"/health"})):
        super().__init__(app)
        self._skip_paths = skip_paths

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = _resolve_request_id(request.headers.get("x-request-id"))
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000
            response.headers["X-Request-Id"] = request_id
            if request.url.path not in self._skip_paths:
                # ``request.method`` and ``request.url.path`` are
                # user-controllable. CodeQL's py/log-injection does NOT
                # treat ``%s`` as a sanitiser; explicit ``repr()`` is the
                # one form it accepts (same trick used in chat/streaming
                # and chat/rate_limit logs).
                logger.info(
                    "%s %s -> %d",
                    repr(request.method),
                    repr(request.url.path),
                    response.status_code,
                    extra={
                        "path": request.url.path,
                        "method": request.method,
                        "status": response.status_code,
                        "duration_ms": round(duration_ms, 2),
                    },
                )
            return response
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "request failed",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "status": 500,
                    "duration_ms": round(duration_ms, 2),
                },
            )
            raise
        finally:
            # Reset AFTER the access log is emitted so the record still
            # carries the request id (the filter reads the ContextVar
            # at log time, not at middleware entry).
            request_id_var.reset(token)
