"""build_graph resolves textual law citations to in-corpus laws (#569).

A reference that carries only citation text ("Ley 39/2015") and no BOE id is
matched against the leading citation in each law's title, so cross-references
become real graph edges instead of being silently dropped (the cause of the
"graph only renders a handful of nodes" bug).
"""

from __future__ import annotations

from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.models import Law, LawMetadata, Reference
from lexflow.graph.builder import build_graph


class _Registry:
    """Fake registry whose laws carry a title + textual (unresolved) references."""

    def __init__(self, laws: dict[str, tuple[str, list[str]]]) -> None:
        # laws: {boe_id: (title, [citation_text, ...])}
        self._laws = laws

    @property
    def law_ids(self) -> list[str]:
        return sorted(self._laws)

    def get_metadata(self, law_id: str) -> LawMetadata:
        title, _ = self._laws[law_id]
        return LawMetadata(identifier=law_id, title=title, rank=LawRank.LEY, status=LawStatus.IN_FORCE)

    def get_law(self, law_id: str) -> Law:
        _title, citations = self._laws[law_id]
        refs = [Reference(target_id=None, target_text=c, source_article=None) for c in citations]
        return Law(metadata=self.get_metadata(law_id), file_path=f"{law_id}.md", references=refs)


def _edges(reg: _Registry) -> set[tuple[str, str]]:
    return set(build_graph(reg).graph.edges())  # type: ignore[arg-type]


def test_textual_citation_resolves_to_edge() -> None:
    edges = _edges(
        _Registry(
            {
                "BOE-A-2018-16673": ("Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos", ["Ley 39/2015"]),
                "BOE-A-2015-10565": ("Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común", []),
            }
        )
    )
    assert ("BOE-A-2018-16673", "BOE-A-2015-10565") in edges


def test_citation_match_is_accent_and_case_insensitive() -> None:
    edges = _edges(
        _Registry(
            {
                "BOE-A-1": ("Ley Orgánica 3/2018, de 5 de diciembre", ["ley organica 3/2018"]),  # self-cite
                "BOE-A-2": ("Ley 39/2015, de 1 de octubre", ["LEY ORGÁNICA 3/2018"]),
            }
        )
    )
    assert ("BOE-A-2", "BOE-A-1") in edges  # matched despite casing + missing accent
    assert ("BOE-A-1", "BOE-A-1") not in edges  # a law citing its own number is not an edge


def test_citation_to_law_outside_corpus_is_not_an_edge() -> None:
    edges = _edges(_Registry({"BOE-A-1": ("Ley 39/2015, de 1 de octubre", ["Ley 99/1999"])}))
    assert edges == set()
