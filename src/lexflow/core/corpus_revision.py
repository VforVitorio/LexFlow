"""Resolve the legalize-es corpus revision — the shared cache-invalidation key.

Every on-disk cache (graph, metadata, search) keys off the submodule's HEAD
commit so a corpus update (git pull / sync) invalidates them together. Lives in
``core`` so the metadata and search caches don't have to reach up into the graph
layer for it (graph/cache.py originally owned this helper).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

UNKNOWN_REVISION = "unknown"


def submodule_hash(data_path: Path) -> str:
    """Return the HEAD commit of the legalize-es checkout, or ``"unknown"``.

    Never raises: a missing git binary or an un-checked-out submodule degrades
    to :data:`UNKNOWN_REVISION` so callers can decide to bypass the cache
    instead of crashing a request.
    """
    try:
        result = subprocess.check_output(
            ["git", "-C", str(data_path), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
        )
        return result.decode().strip()
    # ``check_output`` raises ``CalledProcessError`` on non-zero exit and
    # ``FileNotFoundError`` (subclass of ``OSError``) when git is missing.
    except (subprocess.CalledProcessError, OSError):
        return UNKNOWN_REVISION
