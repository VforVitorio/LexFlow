"""Helper to fetch law metadata for graph node detail panels."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class NodeDetailSummary:
    """Condensed law metadata for graph node detail display."""

    law_id: str
    title: str
    rank: str
    status: str
    publication_date: str
    department: str
    scope: str
    jurisdiction: str
    article_count: int
    reference_count: int

    @classmethod
    def from_api_response(cls, data: dict[str, object]) -> NodeDetailSummary:
        """Build from a raw /api/v1/laws/{id} JSON response dict."""
        return cls(
            law_id=str(data.get("identifier", "")),
            title=str(data.get("title", "")),
            rank=str(data.get("rank", "")),
            status=str(data.get("status", "")),
            publication_date=str(data.get("publication_date", "") or ""),
            department=str(data.get("department", "") or ""),
            scope=str(data.get("scope", "") or ""),
            jurisdiction=str(data.get("jurisdiction", "") or ""),
            article_count=len(data.get("articles", []) or []),  # type: ignore[arg-type]
            reference_count=len(data.get("references", []) or []),  # type: ignore[arg-type]
        )
