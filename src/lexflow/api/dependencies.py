"""FastAPI dependency injection providers."""

from __future__ import annotations

from fastapi import Query

from lexflow.core.registry import LawRegistry, get_registry


def get_law_registry() -> LawRegistry:
    """Dependency that provides the singleton :class:`LawRegistry`."""
    return get_registry()


class PaginationParams:
    """Common pagination query parameters.

    Inject via ``Depends(PaginationParams)`` in endpoint signatures.
    """

    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number"),
        page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    ) -> None:
        self.page = page
        self.page_size = page_size
