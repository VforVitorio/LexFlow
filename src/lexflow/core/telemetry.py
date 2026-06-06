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

Retention: :func:`prune_old_files` deletes daily files older than
``Settings.telemetry_retention_days``. Called once from the FastAPI
lifespan startup so a long-running install doesn't grow the directory
without bound. Setting the env to ``0`` disables pruning entirely.

--- WHERE TO CHANGE IF X CHANGES ---
* Switch to a remote sink → replace :func:`record_events` body and
                             keep the public API.
* Add a new event type    → no code change here; events are
                             schema-light (just ``name`` + props).
* Change retention        → :func:`prune_old_files`. Default + env
                             override live in
                             :mod:`lexflow.utils.config`.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)


_TELEMETRY_ENABLED_ENV = "LEXFLOW_TELEMETRY_ENABLED"
_TELEMETRY_DIR_NAME = "telemetry"
_FILE_WRITE_LOCK = threading.Lock()

# Daily files are named ``YYYY-MM-DD.jsonl``. Strict regex so a hand-
# placed unrelated ``.jsonl`` file (debug dump, manual export) is left
# alone by the pruner rather than parsed as an out-of-range date and
# silently deleted.
_DAILY_FILE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})\.jsonl$")


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


def _parse_daily_filename(name: str) -> date | None:
    """Return the UTC date encoded in a ``YYYY-MM-DD.jsonl`` filename.

    Returns ``None`` for anything that doesn't match the strict
    pattern — that includes manual exports, debug dumps and the
    ``YYYY-MM-DD-something`` shapes a future feature might introduce.
    Keeps :func:`prune_old_files` from deleting files it doesn't own.
    """
    match = _DAILY_FILE_RE.match(name)
    if match is None:
        return None
    try:
        year, month, day = (int(group) for group in match.groups())
        return date(year, month, day)
    except ValueError:
        # Caught the shape but not a real date (e.g. 2026-02-31).
        return None


def prune_old_files(retention_days: int, *, today: date | None = None) -> int:
    """Delete daily telemetry files older than ``retention_days``.

    Returns the number of files actually deleted. A ``retention_days``
    of ``0`` (or negative) is interpreted as "pruning disabled" — we
    return ``0`` without touching the directory so an operator can
    turn off the policy without removing the call site.

    Symmetric semantics with the writer: files whose encoded date is
    strictly older than ``today - retention_days`` are removed; the
    cutoff day itself is kept so the retention window is N full days
    inclusive.

    ``today`` is injectable for deterministic testing — production
    calls leave it ``None`` and the function reads ``datetime.now(UTC)``.
    """
    if retention_days <= 0:
        return 0
    cutoff = (today or datetime.now(UTC).date()) - timedelta(days=retention_days)
    directory = _telemetry_dir()
    if not directory.is_dir():
        return 0
    deleted = 0
    for entry in directory.iterdir():
        if not entry.is_file():
            continue
        encoded = _parse_daily_filename(entry.name)
        if encoded is None or encoded >= cutoff:
            continue
        try:
            entry.unlink()
        except OSError:
            # Same defence-in-depth posture as ``record_events``: keep
            # going on per-file failures instead of poisoning startup.
            logger.warning("Telemetry prune failed for %s", repr(str(entry)), exc_info=True)
            continue
        deleted += 1
    return deleted


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
