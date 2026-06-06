"""Application configuration with singleton access."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT: Path = Path(__file__).resolve().parents[3]
DEFAULT_DATA_PATH: Path = PROJECT_ROOT / "data" / "legalize-es"


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
    """

    data_path: Path
    page_size_default: int
    page_size_max: int
    log_level: str
    config_dir: Path
    telemetry_retention_days: int


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
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton application settings."""
    return _build_settings()
