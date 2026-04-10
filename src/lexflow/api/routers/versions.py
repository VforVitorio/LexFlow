"""Version history and diff endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from lexflow.api.dependencies import get_law_registry
from lexflow.core.git_history import GitHistoryReader
from lexflow.core.models import LawDiff, LawVersion
from lexflow.core.registry import LawRegistry
from lexflow.utils.config import get_settings

router = APIRouter(prefix="/laws/{law_id}", tags=["Versions"])


def _get_git_reader() -> GitHistoryReader:
    """Provide a :class:`GitHistoryReader` pointed at the data directory."""
    settings = get_settings()
    return GitHistoryReader(settings.data_path)


@router.get(
    "/versions",
    response_model=list[LawVersion],
    summary="Get version history of a law",
)
def list_versions(
    law_id: str,
    max_count: int = Query(50, ge=1, le=200, description="Maximum versions to return"),
    registry: LawRegistry = Depends(get_law_registry),
    git_reader: GitHistoryReader = Depends(_get_git_reader),
) -> list[LawVersion]:
    """Return git commit history for a law file, ordered newest-first."""
    law = registry.get_law(law_id)
    return git_reader.get_file_log(law.file_path, max_count=max_count)


@router.get(
    "/diff",
    response_model=LawDiff,
    summary="Get diff between two versions of a law",
)
def get_diff(
    law_id: str,
    from_commit: str = Query(..., alias="from", description="Source commit hash"),
    to_commit: str = Query(..., alias="to", description="Target commit hash"),
    registry: LawRegistry = Depends(get_law_registry),
    git_reader: GitHistoryReader = Depends(_get_git_reader),
) -> LawDiff:
    """Return the unified diff between two versions of a law."""
    law = registry.get_law(law_id)
    return git_reader.get_diff(law.file_path, from_commit, to_commit)
