"""Compliance dashboard: filtering, export and status charts."""

from __future__ import annotations

import csv
import io

from pydantic import BaseModel

from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.registry import LawRegistry
from lexflow.core.schemas import LawSummary


class ComplianceFilter(BaseModel):
    jurisdiction: str | None = None
    rank: LawRank | None = None
    status: LawStatus | None = None


def filter_laws(registry: LawRegistry, f: ComplianceFilter) -> list[LawSummary]:
    result = registry.list_laws(
        page=1,
        page_size=max(registry.total_count, 1),
        rank=f.rank,
        status=f.status,
        jurisdiction=f.jurisdiction,
    )
    return result.items


def export_csv(laws: list[LawSummary]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["identifier", "title", "rank", "status", "jurisdiction", "publication_date"],
    )
    writer.writeheader()
    for law in laws:
        writer.writerow(
            {
                "identifier": law.identifier,
                "title": law.title,
                "rank": law.rank.value,
                "status": law.status.value,
                "jurisdiction": law.jurisdiction or "",
                "publication_date": str(law.publication_date) if law.publication_date else "",
            }
        )
    return output.getvalue()
