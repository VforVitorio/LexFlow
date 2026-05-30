"""Static SPA mount — serves the Vite build in production (single-process mode).

Only activates when ``frontend/dist/`` exists next to the project root.
In dev mode the Vite dev server runs separately on :5173 and proxies
``/api/*`` to FastAPI on :8000, so nothing here is needed.

Invariants:
* API routes (``/api/v1/*``) and ``/health`` are registered *before*
  this module's ``mount_spa`` is called, so the catch-all never shadows them.
* ``/assets/*`` is a StaticFiles mount (efficient ETags, correct
  Content-Type, no Python overhead per request).
* Every other path returns ``index.html`` so React Router handles it.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[4]
SPA_DIR: Path = _PROJECT_ROOT / "frontend" / "dist"


def mount_spa(app: FastAPI) -> None:
    """Attach static-file mount + SPA catch-all to *app* if the build exists.

    Safe to call unconditionally — silently skips when ``frontend/dist/``
    is absent so dev-mode and test runs are unaffected.
    """
    if not SPA_DIR.is_dir():
        logger.debug("frontend/dist not found — SPA mount skipped (dev mode)")
        return

    assets_dir = SPA_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _serve_spa(full_path: str = "") -> FileResponse:
        """Return the exact file if it exists, otherwise serve index.html."""
        candidate = SPA_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(SPA_DIR / "index.html")

    logger.info("SPA mounted from %s", SPA_DIR)
