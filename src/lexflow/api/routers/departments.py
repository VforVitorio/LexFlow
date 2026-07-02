"""``GET /api/v1/departments`` — the issuing-department (ministerio)
vocabulary across the corpus (#671 gap B).

Aggregates each law's ``department`` frontmatter field (BOE metadata, parsed
straight through with no normalisation) into a count-ranked vocabulary. The
frontend uses it for the Explorer department facet.

--- WHERE TO CHANGE IF X CHANGES ---
* Department extraction → ``lexflow.core.parser.frontmatter_to_metadata``.
* Aggregation            → ``LawRegistry.department_counts``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from lexflow.api.dependencies import get_law_registry
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import DepartmentCount, DepartmentsResponse

router = APIRouter(tags=["Departments"])


@router.get(
    "/departments",
    response_model=DepartmentsResponse,
    summary="Issuing department (ministerio) vocabulary, ranked by usage.",
)
def list_departments(
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
) -> DepartmentsResponse:
    """Return ``{items: [{department, count}]}`` sorted by count desc, then name asc."""
    items = [
        DepartmentCount(department=department, count=count) for department, count in registry.department_counts()
    ]
    return DepartmentsResponse(items=items)
