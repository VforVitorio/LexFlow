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
        LEXFLOW_OLLAMA_URL — base URL for the Ollama API
        LEXFLOW_LMSTUDIO_URL — base URL for the LM Studio API
    """

    data_path: Path
    page_size_default: int
    page_size_max: int
    log_level: str
    ollama_base_url: str
    lmstudio_base_url: str


def _build_settings() -> Settings:
    """Read settings from environment variables with sensible defaults."""
    data_path_raw = os.environ.get("LEXFLOW_DATA_PATH")
    data_path = Path(data_path_raw) if data_path_raw else DEFAULT_DATA_PATH

    return Settings(
        data_path=data_path,
        page_size_default=int(os.environ.get("LEXFLOW_PAGE_SIZE", "20")),
        page_size_max=int(os.environ.get("LEXFLOW_PAGE_SIZE_MAX", "100")),
        log_level=os.environ.get("LEXFLOW_LOG_LEVEL", "INFO"),
        ollama_base_url=os.environ.get("LEXFLOW_OLLAMA_URL", "http://localhost:11434"),
        lmstudio_base_url=os.environ.get("LEXFLOW_LMSTUDIO_URL", "http://localhost:1234/v1"),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton application settings."""
    return _build_settings()
