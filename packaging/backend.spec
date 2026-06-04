# PyInstaller spec for the LexFlow backend (#126).
#
# Produces a single-file executable that bundles uvicorn + FastAPI +
# every required runtime dep. The corpus (``data/legalize-es``) is
# NOT bundled — it lives outside the binary and gets resolved at
# runtime via ``LEXFLOW_DATA_PATH``. This keeps the binary at ~35-40
# MB instead of multi-GB, and the user can update the corpus without
# re-downloading the app.
#
# Build (one OS at a time, from the repo root):
#
#   uv run pyinstaller packaging/backend.spec --clean --noconfirm
#
# The matrix CI job in ``.github/workflows/packaging.yml`` runs this
# on Windows / macOS / Linux. UPX compression is optional; the spec
# enables it when UPX is on PATH but doesn't require it (CI runners
# don't ship UPX by default).
#
# --- WHERE TO CHANGE IF X CHANGES ---
# * New runtime-resolved import   → append it to ``hiddenimports``.
# * New static data dir / file    → append a ``(src, dest)`` tuple to
#                                    ``datas``.
# * LLM SDK lazy-loading          → keep openai/anthropic/google off
#                                    ``hiddenimports``; PyInstaller
#                                    will tree-shake them out unless
#                                    explicitly imported.
# * Bundle the SPA build          → set ``BUNDLE_FRONTEND_DIST=1`` in
#                                    the env when invoking pyinstaller;
#                                    the spec then adds frontend/dist
#                                    via ``datas``.

from __future__ import annotations

import os
import shutil
from pathlib import Path

# Repo root resolved from the spec's directory; doesn't depend on the
# invocation cwd so ``pyinstaller packaging/backend.spec`` from
# anywhere produces the same output.
SPECPATH = Path(SPECPATH).resolve() if "SPECPATH" in dir() else Path.cwd()
PROJECT_ROOT = SPECPATH.parent if SPECPATH.name == "packaging" else SPECPATH
SRC_ROOT = PROJECT_ROOT / "src"
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def _datas() -> list[tuple[str, str]]:
    """Return the ``(source, dest_in_bundle)`` pairs to embed.

    The SPA build is opt-in (env flag) so a backend-only binary
    stays cheap. When bundled, FastAPI's static-files mount picks it
    up at runtime via the relative path the spec writes.
    """
    pairs: list[tuple[str, str]] = []
    if os.environ.get("BUNDLE_FRONTEND_DIST") == "1" and FRONTEND_DIST.is_dir():
        pairs.append((str(FRONTEND_DIST), "frontend/dist"))
    return pairs


# Imports we know are pulled in dynamically (string-imported or used
# only via the API surface that PyInstaller can't trace).
#
# Pydantic v2's compiled core has helpers PyInstaller misses; uvicorn
# loads its loop / protocol modules via string names; sqlalchemy's
# dialects + sqlmodel's introspection rely on runtime attribute
# lookup; FastAPI pulls Starlette's static-files transparently.
hiddenimports: list[str] = [
    "pydantic.deprecated.decorator",
    "pydantic_core",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "sqlalchemy.dialects.sqlite",
    "sqlmodel",
    "starlette.middleware",
    "starlette.staticfiles",
    "lexflow.chat.providers.ollama",
    "lexflow.chat.providers.lmstudio",
]

# Cloud LLM SDKs (openai / anthropic / google-genai) are deliberately
# NOT in hiddenimports. The chat layer imports them inside the
# provider classes — PyInstaller tree-shakes them out of the binary
# unless explicitly required, keeping size down. Users who want
# cloud chat install the extras post-launch.

block_cipher = None

a = Analysis(  # noqa: F821  # PyInstaller injects ``Analysis`` at runtime.
    [str(PROJECT_ROOT / "main.py")],
    pathex=[str(SRC_ROOT)],
    binaries=[],
    datas=_datas(),
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Cloud SDKs and their transitive deps — keep out of the
        # default binary. Users who want cloud chat install via pip.
        "openai",
        "anthropic",
        "google.genai",
        "google_genai",
        # Test-only / dev-only.
        "pytest",
        "mypy",
        "ruff",
        # The model wizard needs psutil + nvidia-ml-py at runtime,
        # but pyinstaller picks them up automatically via the import
        # graph.
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)  # noqa: F821

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="lexflow-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=shutil.which("upx") is not None,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
