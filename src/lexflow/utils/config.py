"""Application configuration with singleton access."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT: Path = Path(__file__).resolve().parents[3]
DEFAULT_DATA_PATH: Path = PROJECT_ROOT / "data" / "legalize-es"

# Issue #885 (S1.2) — default Origin allow-list for the CSRF boundary.
# Covers the dev Vite server and the single-process prod bind (both
# localhost and 127.0.0.1, since browsers treat them as distinct
# origins).
_DEFAULT_CSRF_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
)


@dataclass(frozen=True)
class Settings:
    """Immutable application settings.

    Override via environment variables:
        LEXFLOW_DATA_PATH — path to the legalize-es data directory
        LEXFLOW_PAGE_SIZE — default page size for paginated endpoints
        LEXFLOW_PAGE_SIZE_MAX — maximum allowed page size
        LEXFLOW_LOG_LEVEL — logging level
        LEXFLOW_CONFIG_DIR — per-user config dir (audit log lives here)
        LEXFLOW_TELEMETRY_RETENTION_DAYS — number of past days of
            telemetry JSONL files to keep. ``0`` disables pruning.
            Default 30.
        LEXFLOW_EMBEDDER — semantic-search backend: ``hash`` (default,
            dependency-free placeholder) or ``sentence-transformers``
            (real multilingual model; needs the ``[semantic]`` extra).
        LEXFLOW_EMBEDDER_MODEL — sentence-transformers model name used
            when the backend is ``sentence-transformers``.
        LEXFLOW_RERANK — hybrid-search re-ranker: ``none`` (default) or
            ``cross-encoder`` (re-ranks the fused top-K; needs the
            ``[semantic]`` extra).
        LEXFLOW_RERANK_MODEL — cross-encoder model name used when the
            re-ranker is ``cross-encoder``.
        LEXFLOW_CSRF_HEADER_NAME — name of the custom header the SPA
            must set on state-changing / spawn-triggering routes
            (issue #885, S1.2). Default ``X-Lexflow-Client``.
        LEXFLOW_CSRF_HEADER_VALUE — required value of that header.
            Default ``spa``.
        LEXFLOW_CSRF_ALLOWED_ORIGINS — comma-separated allow-list
            checked against the inbound ``Origin`` header when
            present. Default covers the local dev Vite server and the
            prod single-process bind.
    """

    data_path: Path
    page_size_default: int
    page_size_max: int
    log_level: str
    config_dir: Path
    telemetry_retention_days: int
    embedder_backend: str
    embedder_model: str
    rerank_backend: str
    rerank_model: str
    csrf_header_name: str
    csrf_header_value: str
    csrf_allowed_origins: tuple[str, ...]


def _build_settings() -> Settings:
    """Read settings from environment variables with sensible defaults."""
    data_path_raw = os.environ.get("LEXFLOW_DATA_PATH")
    data_path = Path(data_path_raw) if data_path_raw else DEFAULT_DATA_PATH

    config_dir_raw = os.environ.get("LEXFLOW_CONFIG_DIR")
    config_dir = Path(config_dir_raw) if config_dir_raw else Path.home() / ".lexflow"

    return Settings(
        data_path=data_path,
        page_size_default=int(os.environ.get("LEXFLOW_PAGE_SIZE", "20")),
        page_size_max=int(os.environ.get("LEXFLOW_PAGE_SIZE_MAX", "100")),
        log_level=os.environ.get("LEXFLOW_LOG_LEVEL", "INFO"),
        config_dir=config_dir,
        telemetry_retention_days=int(os.environ.get("LEXFLOW_TELEMETRY_RETENTION_DAYS", "30")),
        embedder_backend=os.environ.get("LEXFLOW_EMBEDDER", "hash"),
        # Keep in sync with ``sentence_transformer_embedder.DEFAULT_MODEL``.
        embedder_model=os.environ.get("LEXFLOW_EMBEDDER_MODEL", "paraphrase-multilingual-MiniLM-L12-v2"),
        rerank_backend=os.environ.get("LEXFLOW_RERANK", "none"),
        # Keep in sync with ``cross_encoder.DEFAULT_RERANK_MODEL``.
        rerank_model=os.environ.get("LEXFLOW_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2"),
        csrf_header_name=os.environ.get("LEXFLOW_CSRF_HEADER_NAME", "X-Lexflow-Client"),
        csrf_header_value=os.environ.get("LEXFLOW_CSRF_HEADER_VALUE", "spa"),
        csrf_allowed_origins=_parse_origins(os.environ.get("LEXFLOW_CSRF_ALLOWED_ORIGINS")),
    )


def _parse_origins(raw: str | None) -> tuple[str, ...]:
    """Parse a comma-separated origin list, falling back to the default."""
    if not raw:
        return _DEFAULT_CSRF_ALLOWED_ORIGINS
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton application settings."""
    return _build_settings()
