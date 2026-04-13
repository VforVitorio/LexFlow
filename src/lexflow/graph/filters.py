"""Filter criteria for graph node selection."""

from __future__ import annotations

from dataclasses import dataclass, field

from lexflow.core.enums import LawRank, LawStatus


@dataclass
class GraphFilter:
    """Criteria for filtering which law nodes appear in the graph view."""

    ranks: list[LawRank] = field(default_factory=list)
    statuses: list[LawStatus] = field(default_factory=list)
    year_from: int | None = None
    year_to: int | None = None
    jurisdiction: str | None = None

    def matches_node(self, attrs: dict[str, object]) -> bool:
        """Return True if a graph node's attribute dict passes all active filters.

        Args:
            attrs: Node attribute dict (from ``nx.DiGraph.nodes[node_id]``).
        """
        if self.ranks and attrs.get("rank") not in self.ranks:
            return False
        if self.statuses and attrs.get("status") not in self.statuses:
            return False
        if self.jurisdiction and attrs.get("jurisdiction") != self.jurisdiction:
            return False
        pub_date = attrs.get("publication_date")
        if pub_date is not None:
            # publication_date is stored as a string "YYYY-MM-DD" or date
            year_str = str(pub_date)[:4]
            try:
                year = int(year_str)
            except ValueError:
                year = 0
            if self.year_from is not None and year < self.year_from:
                return False
            if self.year_to is not None and year > self.year_to:
                return False
        return True

    def is_empty(self) -> bool:
        """Return True when no filters are active (show everything)."""
        return (
            not self.ranks
            and not self.statuses
            and self.year_from is None
            and self.year_to is None
            and self.jurisdiction is None
        )
