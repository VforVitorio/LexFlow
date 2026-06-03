"""Structured logging + request-id correlation (#92).

Two responsibilities, no extra deps:

1. ``configure_logging`` swaps the root logger's handler between a
   ``console`` formatter (human-readable colours) and a ``json`` formatter
   (one JSON object per line, ready for `jq` / Loki / CloudWatch).
   The choice is driven by ``LEXFLOW_LOG_FORMAT``; default is
   ``console`` so ``uv run python main.py`` stays friendly.

2. ``RequestIdMiddleware`` (in :mod:`lexflow.api.middleware`) attaches a
   UUID4 to a :class:`~contextvars.ContextVar` for the lifetime of each
   FastAPI request. The filter below pulls that id into every
   :class:`logging.LogRecord` so chat-stream logs, audit log warnings
   and sync errors all share the same correlation id as the inbound
   request that triggered them.

The wire format of a single JSON line:

.. code-block:: json

    {"ts": "2026-06-03T10:42:11Z", "level": "INFO", "event": "lexflow.api.app",
     "msg": "Application startup complete", "request_id": null,
     "extra": {"path": "/api/v1/laws", "duration_ms": 12}}

Fields ``path`` / ``method`` / ``status`` / ``duration_ms`` live under
``extra`` so the top-level shape stays stable as we add domain-specific
keys.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a top-level JSON field   → :class:`_JsonFormatter._build_payload`.
* Add a new context var        → bind it in
                                  :class:`RequestIdFilter._inject`.
* Switch to ``structlog``      → replace this module's content but keep
                                  the public API (``configure_logging``,
                                  ``request_id_var``).
"""

from __future__ import annotations

import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

# Context var read by :class:`RequestIdFilter`. The middleware sets it
# inside the request scope; anywhere outside a request (startup hooks,
# CLI invocations, MCP-server boots) it stays ``None`` and the record
# carries ``request_id: null``.
request_id_var: ContextVar[str | None] = ContextVar("lexflow_request_id", default=None)

# Env knob. ``json`` for prod / docker compose; default ``console`` for
# local dev where humans read the logs directly.
LOG_FORMAT_ENV = "LEXFLOW_LOG_FORMAT"
LOG_LEVEL_ENV = "LEXFLOW_LOG_LEVEL"


class RequestIdFilter(logging.Filter):
    """Attach the current request id (if any) to every ``LogRecord``.

    Filters run BEFORE formatters; setting the attribute here means
    both the console and JSON formatters can render ``record.request_id``
    without each handler having to read the ContextVar themselves.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # Always set the attribute — even when no request is in flight —
        # so the JSON formatter never has to branch on `hasattr`.
        record.request_id = request_id_var.get()
        return True


# Standard `logging.LogRecord` attribute names. Anything else attached
# to a record (via ``logger.info("...", extra={...})``) is ours and goes
# under the JSON ``extra`` block.
_RESERVED_RECORD_ATTRS: frozenset[str] = frozenset(
    {
        "name",
        "msg",
        "args",
        "levelname",
        "levelno",
        "pathname",
        "filename",
        "module",
        "exc_info",
        "exc_text",
        "stack_info",
        "lineno",
        "funcName",
        "created",
        "msecs",
        "relativeCreated",
        "thread",
        "threadName",
        "processName",
        "process",
        "message",
        "asctime",
        "request_id",
        # Python 3.12+ adds ``taskName`` automatically to records emitted
        # inside an asyncio task. It's stdlib metadata, not ours.
        "taskName",
    }
)


class _JsonFormatter(logging.Formatter):
    """One JSON object per log line.

    Fields are kept short on purpose (Loki/CloudWatch parse them faster
    when the keys are < 16 chars). ``event`` is the logger name (e.g.
    ``lexflow.api.app``); ``msg`` is the rendered message. Exception
    info is appended under ``exc`` only when present.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = self._build_payload(record)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    def _build_payload(self, record: logging.LogRecord) -> dict[str, Any]:
        out: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "level": record.levelname,
            "event": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
        }
        # User-attached kwargs via `extra={...}` land as record attributes;
        # bundle them into a single ``extra`` block so the top-level shape
        # is stable.
        extra = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED_RECORD_ATTRS and not key.startswith("_")
        }
        if extra:
            out["extra"] = extra
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return out


class _ConsoleFormatter(logging.Formatter):
    """Human-readable formatter — same fields as the JSON one, prettier.

    Sample line::

        12:34:56 INFO  lexflow.api.app                       Application startup complete

    A bracketed ``[req=<short-id>]`` is appended when a request id is
    present, so `tail -f` during local dev still gives the operator a
    way to correlate a chain of log lines.
    """

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, UTC).strftime("%H:%M:%S")
        rid = getattr(record, "request_id", None)
        suffix = f" [req={rid[:8]}]" if rid else ""
        return f"{ts} {record.levelname:<5} {record.name:<36} {record.getMessage()}{suffix}"


def configure_logging() -> None:
    """Wire the root logger once at process start.

    Idempotent: a second call replaces handlers in place rather than
    stacking them. Settings:

    * ``LEXFLOW_LOG_FORMAT``: ``json`` or ``console`` (default).
    * ``LEXFLOW_LOG_LEVEL``: ``DEBUG`` / ``INFO`` (default) / ``WARNING``.
    """
    fmt = os.environ.get(LOG_FORMAT_ENV, "console").lower()
    level_name = os.environ.get(LOG_LEVEL_ENV, "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(_JsonFormatter() if fmt == "json" else _ConsoleFormatter())
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    # Clear pre-existing handlers (uvicorn / pytest may have installed
    # their own) so we don't double-log.
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # uvicorn's own loggers default to its colour handler. Re-parent
    # them to root so the request-id filter sees their records too.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers.clear()
        uv_logger.propagate = True
