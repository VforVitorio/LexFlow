"""Tests for incremental graph updates: apply_diff_to_graph (#230).

Uses a hand-built fake registry so the graph logic (edges + dangling
resolution) is exercised deterministically, independent of the parser.
"""

from __future__ import annotations

from lexflow.core.delta_sync import CorpusDiff
from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.models import Law, LawMetadata, Reference
from lexflow.graph.builder import apply_diff_to_graph, build_graph
from lexflow.graph.model import LegalGraph


class FakeRegistry:
    """Minimal registry: each law is (title, [target_ids it references])."""

    def __init__(self, laws: dict[str, tuple[str, list[str]]]) -> None:
        self._laws = laws

    def set_law(self, law_id: str, title: str, refs: list[str]) -> None:
        self._laws[law_id] = (title, refs)

    def drop_law(self, law_id: str) -> None:
        self._laws.pop(law_id, None)

    @property
    def law_ids(self) -> list[str]:
        return sorted(self._laws)

    def has_law(self, law_id: str) -> bool:
        return law_id in self._laws

    def get_metadata(self, law_id: str) -> LawMetadata:
        title, _ = self._laws[law_id]
        return LawMetadata(identifier=law_id, title=title, rank=LawRank.LEY, status=LawStatus.IN_FORCE)

    def get_law(self, law_id: str) -> Law:
        _title, refs = self._laws[law_id]
        references = [Reference(target_id=t, target_text=t, source_article=None) for t in refs]
        return Law(metadata=self.get_metadata(law_id), file_path=f"{law_id}.md", references=references)


def _edges(graph: LegalGraph) -> set[tuple[str, str]]:
    return set(graph.graph.edges())


def _nodes(graph: LegalGraph) -> set[str]:
    return set(graph.graph.nodes())


def test_build_captures_resolved_and_dangling() -> None:
    reg = FakeRegistry({"A": ("Ley A", ["B", "Z"]), "B": ("Ley B", [])})
    graph = build_graph(reg)  # type: ignore[arg-type]
    assert _edges(graph) == {("A", "B")}  # A->Z dangling (Z absent)
    assert "Z" in graph.dangling
    assert graph.dangling["Z"][0]["source"] == "A"


def test_remove_law_parks_incoming_as_dangling() -> None:
    reg = FakeRegistry({"A": ("Ley A", ["B"]), "B": ("Ley B", [])})
    graph = build_graph(reg)  # type: ignore[arg-type]
    assert ("A", "B") in _edges(graph)

    reg.drop_law("B")
    apply_diff_to_graph(graph, reg, CorpusDiff(added=[], modified=[], removed=["B"]))  # type: ignore[arg-type]

    assert ("A", "B") not in _edges(graph)
    assert "B" not in _nodes(graph)
    assert graph.dangling["B"][0]["source"] == "A"  # ready to re-resolve


def test_add_law_resolves_waiting_incoming() -> None:
    reg = FakeRegistry({"A": ("Ley A", ["B"])})  # B absent -> dangling
    graph = build_graph(reg)  # type: ignore[arg-type]
    assert _edges(graph) == set()
    assert "B" in graph.dangling

    reg.set_law("B", "Ley B", [])
    apply_diff_to_graph(graph, reg, CorpusDiff(added=["B"], modified=[], removed=[]))  # type: ignore[arg-type]

    assert ("A", "B") in _edges(graph)
    assert "B" not in graph.dangling  # resolved, no longer waiting


def test_modify_law_refreshes_outgoing_edges() -> None:
    reg = FakeRegistry({"A": ("Ley A", ["B"]), "B": ("Ley B", []), "C": ("Ley C", [])})
    graph = build_graph(reg)  # type: ignore[arg-type]
    assert _edges(graph) == {("A", "B")}

    reg.set_law("A", "Ley A", ["C"])  # A now points to C instead of B
    apply_diff_to_graph(graph, reg, CorpusDiff(added=[], modified=["A"], removed=[]))  # type: ignore[arg-type]

    assert _edges(graph) == {("A", "C")}


def test_modify_keeps_incoming_edges_and_refreshes_node() -> None:
    reg = FakeRegistry({"A": ("Ley A", ["B"]), "B": ("Ley B", [])})
    graph = build_graph(reg)  # type: ignore[arg-type]

    reg.set_law("B", "Ley B v2", [])  # modify B (a referenced target)
    apply_diff_to_graph(graph, reg, CorpusDiff(added=[], modified=["B"], removed=[]))  # type: ignore[arg-type]

    assert ("A", "B") in _edges(graph)  # incoming edge survived
    assert graph.graph.nodes["B"]["title"] == "Ley B v2"  # node attrs refreshed


def test_unresolved_target_stays_dangling_after_modify() -> None:
    reg = FakeRegistry({"A": ("Ley A", [])})
    graph = build_graph(reg)  # type: ignore[arg-type]

    reg.set_law("A", "Ley A", ["GHOST"])  # references a law not in corpus
    apply_diff_to_graph(graph, reg, CorpusDiff(added=[], modified=["A"], removed=[]))  # type: ignore[arg-type]

    assert _edges(graph) == set()
    assert graph.dangling["GHOST"][0]["source"] == "A"
