"""SQLite engine + session factory for chat thread persistence (issue #83).

The DB lives at ``data/chat.db`` by default — co-located with the
legalize-es submodule under ``data/``. Override with ``LEXFLOW_CHAT_DB_PATH``
(absolute or relative path); tests use ``:memory:``.

We do *not* run Alembic migrations yet. ``init_db()`` calls
``SQLModel.metadata.create_all`` which is idempotent for new tables and
columns we add purely by widening. Once the surface stabilises, we'll
add a real migration tool.

--- WHERE TO CHANGE IF X CHANGES ---
* Tests need a fresh DB per case  → call :func:`init_db_for_path` with a
                                    ``tmp_path / "chat.db"``.
* Drop the SQLite default         → swap ``_DEFAULT_DB_PATH`` or the env
                                    override; the engine URL builder is
                                    isolated in :func:`_engine_url`.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

# Imported for its side effect — SQLModel.metadata picks up the two
# tables defined in storage_models so ``create_all`` actually creates
# them. Do NOT remove even if it looks unused.
from lexflow.chat import storage_models as _storage_models  # noqa: F401

_DEFAULT_DB_PATH = Path("data") / "chat.db"
_ENV_VAR = "LEXFLOW_CHAT_DB_PATH"

# One engine per process. Module-level lazy init guarded by a lock so the
# first request to hit a router after startup is responsible for the
# (cheap) connect — subsequent requests reuse the same engine.
_engine: Engine | None = None
_engine_lock = threading.Lock()


def _resolve_db_path() -> str:
    """Resolve the DB location at engine-build time.

    Order of precedence:
    1. ``LEXFLOW_CHAT_DB_PATH`` env var (absolute path or ``:memory:``).
    2. ``data/chat.db`` relative to the current working directory.
    """
    raw = os.environ.get(_ENV_VAR, "").strip()
    if raw:
        return raw
    return str(_DEFAULT_DB_PATH)


def _engine_url(db_path: str) -> str:
    """Build the SQLAlchemy URL from a path string."""
    if db_path == ":memory:":
        return "sqlite:///:memory:"
    return f"sqlite:///{db_path}"


def _build_engine(db_path: str) -> Engine:
    """Construct the SQLAlchemy engine + ensure the parent dir exists."""
    if db_path != ":memory:":
        parent = Path(db_path).parent
        if parent and not parent.exists():
            parent.mkdir(parents=True, exist_ok=True)
    # ``check_same_thread=False`` lets FastAPI's threadpool handlers reuse
    # the same connection pool — SQLite itself is fine with multi-thread
    # access as long as you don't share a *connection* across writes,
    # which SQLAlchemy's pool already handles for us.
    return create_engine(
        _engine_url(db_path),
        connect_args={"check_same_thread": False},
        # Echo only on demand — set LEXFLOW_CHAT_DB_ECHO=1 for noisy SQL.
        echo=bool(os.environ.get("LEXFLOW_CHAT_DB_ECHO")),
    )


def get_engine() -> Engine:
    """Return the process-wide engine, building it on first call."""
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = _build_engine(_resolve_db_path())
    return _engine


def init_db() -> None:
    """Ensure all chat tables exist on the current engine.

    Safe to call multiple times — ``create_all`` is a no-op when the
    tables already exist with the expected columns. Called from the
    FastAPI lifespan startup hook.
    """
    SQLModel.metadata.create_all(get_engine())


def init_db_for_path(db_path: str | Path) -> Engine:
    """Test helper: rebuild the engine pointing at ``db_path`` and
    create the schema there. Returns the engine so tests can dispose
    of it explicitly if they want.
    """
    global _engine
    new_engine = _build_engine(str(db_path))
    SQLModel.metadata.create_all(new_engine)
    with _engine_lock:
        _engine = new_engine
    return new_engine


def get_session() -> Iterator[Session]:
    """FastAPI dependency. Yields a session and closes it on response.

    We open a fresh session per request — SQLite is fast enough that the
    overhead is invisible, and it sidesteps every "stale identity map"
    bug that a long-lived session would introduce.
    """
    with Session(get_engine()) as session:
        yield session
