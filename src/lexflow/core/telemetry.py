"""Opt-in usage telemetry (#74).

Privacy model: telemetry is **off by default**. The backend only
persists events when ``LEXFLOW_TELEMETRY_ENABLED=1`` is set in the
environment. The SPA additionally honours a local opt-in flag and
will not send events at all until the user toggles privacy on in
Settings — so we have two independent gates between an event being
emitted in the UI and a byte being written to disk.

Wire shape (one JSONL record per event line):

.. code-block:: json

    {"ts": "2026-06-03T14:00:00Z",
     "name": "page_view",
     "props": {"path": "/laws"}}

Storage: one file per UTC day under
``<config_dir>/telemetry/YYYY-MM-DD.jsonl``. Locally inspectable with
``jq``. No remote sink — that's intentional for the desktop-app
distribution target.

--- WHERE TO CHANGE IF X CHANGES ---
* Switch to a remote sink → replace :func:`record_events` body and
                             keep the public API.
* Add a new event type    → no code change here; events are
                             schema-light (just ``name`` + props).
* Change retention        → :func:`prune_old_files` (not yet wired —
                             see follow-up tracker).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)


_TELEMETRY_ENABLED_ENV = "LEXFLOW_TELEMETRY_ENABLED"
_TELEMETRY_DIR_NAME = "telemetry"
_FILE_WRITE_LOCK = threading.Lock()


class TelemetryEvent(BaseModel):
    """One inbound telemetry record.

    ``name`` is a short event tag (``page_view``, ``palette_command``).
    ``props`` carries the minimum context needed to make the event
    useful. The model is intentionally permissive to keep the wire
    contract stable as we add categories.
    """

    name: str = Field(min_length=1, max_length=64)
    props: dict[str, Any] = Field(default_factory=dict)


class TelemetryStatus(BaseModel):
    """Status response for ``GET /api/v1/telemetry/status``."""

    enabled: bool


def is_enabled() -> bool:
    """Return whether the backend will persist events.

    Read at every call so an operator can flip the env mid-run if
    needed (e.g. one-shot debug session). Cheap (one ``os.environ``
    lookup).
    """
    raw = os.environ.get(_TELEMETRY_ENABLED_ENV, "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _telemetry_dir() -> Path:
    """Return the directory holding the daily JSONL files."""
    settings = get_settings()
    return settings.config_dir / _TELEMETRY_DIR_NAME


def _file_for(now: datetime) -> Path:
    """Return today's JSONL path (one file per UTC day)."""
    day = now.strftime("%Y-%m-%d")
    return _telemetry_dir() / f"{day}.jsonl"


def _serialize_event(event: TelemetryEvent, now: datetime) -> str:
    """Render an event as one JSONL line."""
    payload = {
        "ts": now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z",
        "name": event.name,
        "props": event.props,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def record_events(events: list[TelemetryEvent]) -> int:
    """Persist a batch of events when telemetry is enabled.

    Returns the number of events actually written. When the backend
    gate is off, returns ``0`` and writes nothing — callers should
    treat this as a normal accept-and-discard path.

    Failures during persistence are logged at WARNING and surfaced as
    ``0`` so a corrupted config dir never breaks the user-facing flow
    that fired the event.
    """
    if not is_enabled() or not events:
        return 0
    now = datetime.now(UTC)
    lines = [_serialize_event(e, now) for e in events]
    target = _file_for(now)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with _FILE_WRITE_LOCK, target.open("a", encoding="utf-8") as fh:
            for line in lines:
                fh.write(line + "\n")
    except OSError:
        # ``target`` derives from ``LEXFLOW_CONFIG_DIR`` (operator-set,
        # not request-controlled) but CodeQL's py/log-injection flags
        # any ``%s`` interpolation of external input. Use explicit
        # ``repr()`` — the only sanitiser the query recognises.
        logger.warning("Telemetry write failed for %s", repr(str(target)), exc_info=True)
        return 0
    return len(lines)
