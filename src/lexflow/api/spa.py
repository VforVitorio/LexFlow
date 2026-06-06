"""Static SPA mount — serves the Vite build in production (single-process mode).

Only activates when ``frontend/dist/`` exists next to the project root.
In dev mode the Vite dev server runs separately on :5173 and proxies
``/api/*`` to FastAPI on :8000, so nothing here is needed.

Invariants:
* API routes (``/api/v1/*``) and ``/health`` are registered *before*
  this module's ``mount_spa`` is called, so the catch-all never shadows them.
* ``/assets/*`` is a StaticFiles mount (efficient ETags, correct
  Content-Type, no Python overhead per request).
* The catch-all containment check (``relative_to(SPA_DIR_RESOLVED)``)
  is the single line that prevents an arbitrary file read via
  ``..``/encoded path traversal. Audit #409 finding: an unresolved
  candidate path lets a desktop binary leak arbitrary host files.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

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

    spa_root = SPA_DIR.resolve()
    index_html = spa_root / "index.html"

    assets_dir = spa_root / "assets"
    if assets_dir.is_dir():
        # StaticFiles already prevents traversal — we only mount it for
        # the per-file ETag / Content-Type / range handling.
        from fastapi.staticfiles import StaticFiles

        app.mount("/assets", StaticFiles(directory=assets_dir), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _serve_spa(full_path: str = "") -> FileResponse:
        """Return the exact file if it exists inside SPA_DIR, otherwise index.html.

        Path containment guard (audit #409 critical): without it,
        ``GET /..%2F..%2Fetc%2Fpasswd`` resolves to a host file and the
        desktop binary leaks it. ``resolve()`` collapses ``..`` segments;
        ``relative_to(spa_root)`` raises ``ValueError`` for anything
        outside the build tree, which we map to the SPA index page so
        an attacker can't even distinguish "escaped" from "not found".
        """
        try:
            candidate = (spa_root / full_path).resolve()
            candidate.relative_to(spa_root)
        except (OSError, ValueError):
            return FileResponse(index_html)
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_html)

    logger.info("SPA mounted from %s", spa_root)
