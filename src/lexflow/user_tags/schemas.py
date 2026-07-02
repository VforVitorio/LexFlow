"""Pydantic schemas for the personal user-tags surface (issue #670).

Contract between ``lexflow.api.routers.user_tags`` and the frontend.
Keep field names in ``snake_case``; the frontend converts to
``camelCase`` through its typed wrapper.

Storage-layer counterpart lives in :mod:`lexflow.user_tags.models`.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UserTagRead(BaseModel):
    """One tag as returned to the client."""

    model_config = ConfigDict(extra="forbid")

    tag: str
    label: str


class UserTagCreate(BaseModel):
    """Body of ``POST /laws/{law_id}/user-tags``."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(..., min_length=1)


class UserTagsResponse(BaseModel):
    """Envelope for ``GET /laws/{law_id}/user-tags``."""

    model_config = ConfigDict(extra="forbid")

    items: list[UserTagRead]


class UserTagCount(BaseModel):
    """One tag slug + how many distinct laws carry it."""

    model_config = ConfigDict(extra="forbid")

    tag: str
    label: str
    count: int


class UserTagVocabResponse(BaseModel):
    """Envelope for ``GET /user-tags`` — the global tag vocabulary."""

    model_config = ConfigDict(extra="forbid")

    items: list[UserTagCount]


class UserTagLawsResponse(BaseModel):
    """Envelope for ``GET /user-tags/{tag}/laws``."""

    model_config = ConfigDict(extra="forbid")

    law_ids: list[str]
