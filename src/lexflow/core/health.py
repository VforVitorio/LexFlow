"""Extended health snapshot for ops + the Settings UI (#74).

The classic ``/health`` at the app root stays a one-liner so liveness
probes from docker / k8s / uvicorn keep returning in <1 ms. This
module powers the richer ``GET /api/v1/system/health`` which reports:

* process uptime + version,
* resident memory + system memory pressure,
* disk usage of the partition the corpus lives on,
* corpus reachability (submodule present + indexed),
* chat DB reachability.

Overall ``status`` is ``ok`` when every probe is green, ``degraded``
when at least one is red but the API is still serving requests. We
intentionally never return ``error`` here — if the process can answer
this endpoint, it is alive. Probe-level details tell the operator
where to look.

--- WHERE TO CHANGE IF X CHANGES ---
* Add a new probe          → write a ``_probe_<name>`` helper and
                              call it from :func:`build_health_snapshot`.
* Tune memory/disk warning thresholds → :data:`_DISK_WARN_PERCENT`,
                              :data:`_MEM_WARN_PERCENT`.
* Move the chat DB         → :func:`_probe_chat_db`.
"""

from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

import psutil
from pydantic import BaseModel

from lexflow import __version__
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)


_PROCESS_START_MONOTONIC: float = time.monotonic()
_DISK_WARN_PERCENT: float = 90.0
_MEM_WARN_PERCENT: float = 92.0
_BYTES_PER_GB: int = 1024**3
_BYTES_PER_MB: int = 1024**2


class _MemoryProbe(BaseModel):
    rss_mb: float
    system_used_percent: float


class _DiskProbe(BaseModel):
    # Audit #409: `path` used to be `str(data_path)` which leaked the
    # OS username + arbitrary local layout. We now expose only the
    # mount root, enough for the operator to reason about disk fill
    # without doubling as recon for a directory-traversal attacker.
    mount: str
    total_gb: float
    used_gb: float
    free_gb: float
    used_percent: float


class _CorpusProbe(BaseModel):
    submodule_present: bool
    laws_indexed: int


class _ChatDbProbe(BaseModel):
    reachable: bool


class HealthSnapshot(BaseModel):
    """Wire format for ``GET /api/v1/system/health``."""

    status: str  # "ok" | "degraded"
    version: str
    uptime_seconds: float
    memory: _MemoryProbe
    disk: _DiskProbe
    corpus: _CorpusProbe
    chat_db: _ChatDbProbe


def _probe_memory() -> _MemoryProbe:
    """Resident set + system-wide memory pressure."""
    process = psutil.Process()
    rss_bytes = process.memory_info().rss
    system = psutil.virtual_memory()
    return _MemoryProbe(
        rss_mb=round(rss_bytes / _BYTES_PER_MB, 1),
        system_used_percent=round(system.percent, 1),
    )


def _probe_disk(data_path: Path) -> _DiskProbe:
    """Disk usage on the partition holding the corpus.

    Falls back to the parent path when ``data_path`` itself doesn't
    exist yet — ``shutil.disk_usage`` requires an existing path.
    """
    target = data_path if data_path.exists() else data_path.parent
    usage = shutil.disk_usage(target)
    total = usage.total
    used = usage.used
    free = usage.free
    # Compute the mount root for `mount` reporting. ``Path.anchor`` is
    # the drive on Windows (``C:\``) and ``/`` on Unix — enough for the
    # operator while keeping the rest of the local filesystem layout
    # private. See `_DiskProbe.mount` docstring.
    mount = target.anchor or "/"
    return _DiskProbe(
        mount=mount,
        total_gb=round(total / _BYTES_PER_GB, 2),
        used_gb=round(used / _BYTES_PER_GB, 2),
        free_gb=round(free / _BYTES_PER_GB, 2),
        used_percent=round((used / total) * 100, 1) if total else 0.0,
    )


def _probe_corpus(data_path: Path) -> _CorpusProbe:
    """Submodule presence + how many laws are currently in the registry.

    Audit #409: a misconfigured ``LEXFLOW_DATA_PATH`` pointing at a
    regular file used to crash ``iterdir()`` with
    ``NotADirectoryError`` and propagate a 500 — the exact opposite of
    a health endpoint's "always answer" invariant. Using ``is_dir()``
    as the guard short-circuits cleanly for both files and dangling
    symlinks; the operator sees ``submodule_present: false`` and can
    triage from there.
    """
    submodule_present = data_path.is_dir() and any(data_path.iterdir())
    laws_indexed = 0
    try:
        from lexflow.core.registry import get_registry

        registry = get_registry()
        laws_indexed = registry.total_count
    except Exception:
        # A failing registry is informational; ``laws_indexed == 0``
        # surfaces the failure to the operator without raising.
        logger.exception("Registry probe failed during /health")
    return _CorpusProbe(submodule_present=submodule_present, laws_indexed=laws_indexed)


def _probe_chat_db() -> _ChatDbProbe:
    """Cheap SELECT 1 against the chat SQLite to confirm the file is reachable."""
    try:
        from sqlalchemy import text

        from lexflow.chat.db import get_engine

        engine = get_engine()
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return _ChatDbProbe(reachable=True)
    except Exception:
        logger.exception("Chat DB probe failed during /health")
        return _ChatDbProbe(reachable=False)


def _derive_overall_status(
    memory: _MemoryProbe,
    disk: _DiskProbe,
    corpus: _CorpusProbe,
    chat_db: _ChatDbProbe,
) -> str:
    """Reduce per-probe results to a single ``ok`` / ``degraded`` flag."""
    if not chat_db.reachable:
        return "degraded"
    if not corpus.submodule_present:
        return "degraded"
    if disk.used_percent >= _DISK_WARN_PERCENT:
        return "degraded"
    if memory.system_used_percent >= _MEM_WARN_PERCENT:
        return "degraded"
    return "ok"


def build_health_snapshot() -> HealthSnapshot:
    """Run every probe and assemble the full snapshot.

    Each probe is independent — a failing probe never short-circuits
    the others — so the operator always sees the full picture even
    when something is broken.
    """
    settings = get_settings()
    memory = _probe_memory()
    disk = _probe_disk(settings.data_path)
    corpus = _probe_corpus(settings.data_path)
    chat_db = _probe_chat_db()
    return HealthSnapshot(
        status=_derive_overall_status(memory, disk, corpus, chat_db),
        version=__version__,
        uptime_seconds=round(time.monotonic() - _PROCESS_START_MONOTONIC, 1),
        memory=memory,
        disk=disk,
        corpus=corpus,
        chat_db=chat_db,
    )
