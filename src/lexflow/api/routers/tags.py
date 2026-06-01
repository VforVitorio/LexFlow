"""``GET /api/v1/tags`` — the tag vocabulary across the corpus (#145).

Aggregates the normalised tags the parser extracts from each law's YAML
frontmatter (``tags`` / ``categories`` / ``keywords``) into a
count-ranked vocabulary. The frontend uses it for the Explorer tag
filter and the command-palette tag chips.

--- WHERE TO CHANGE IF X CHANGES ---
* Tag extraction / normalisation → ``lexflow.core.parser`` (extract_tags,
  normalize_tag).
* Aggregation                    → ``LawRegistry.tag_counts``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from lexflow.api.dependencies import get_law_registry
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import TagCount, TagsResponse

router = APIRouter(tags=["Tags"])


@router.get(
    "/tags",
    response_model=TagsResponse,
    summary="Tag vocabulary across the corpus, ranked by usage.",
)
def list_tags(
    registry: Annotated[LawRegistry, Depends(get_law_registry)],
) -> TagsResponse:
    """Return ``{items: [{tag, count}]}`` sorted by count desc, then tag asc.

    Sprint 6 api-6: previously returned a bare list. Wrapped now so the
    contract has room to grow (e.g. total distinct tags, pagination).
    """
    items = [TagCount(tag=tag, count=count) for tag, count in registry.tag_counts()]
    return TagsResponse(items=items)
