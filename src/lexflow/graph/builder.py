"""Build LegalGraph from LawRegistry.

Also owns the incremental update path (:func:`apply_diff_to_graph`, #230)
since it's the one place that knows about both the registry and the graph.
References whose target law isn't in the corpus are parked in the graph's
dangling index so a later incremental add can resolve them.
"""

from __future__ import annotations

import logging
import unicodedata

from lexflow.core.delta_sync import CorpusDiff
from lexflow.core.enums import ReferenceKind
from lexflow.core.exceptions import LexFlowError
from lexflow.core.models import Law

# Reuse the parser's citation pattern so a reference's text and a law title's
# leading citation are matched by the exact same rule (no drift, #569).
from lexflow.core.parser import _LAW_REF_RE
from lexflow.core.registry import LawRegistry
from lexflow.graph.model import LegalGraph

logger = logging.getLogger(__name__)


def _ref_signature(text: str) -> str | None:
    """Normalise a law citation to a lookup key in ``ley 39/2015`` form.

    Lowercased, accent-stripped and whitespace-collapsed so a reference's text
    and a law title's leading citation compare equal regardless of casing or
    accents. Returns ``None`` when *text* carries no recognisable citation.
    """
    match = _LAW_REF_RE.search(text)
    if not match:
        return None
    folded = unicodedata.normalize("NFKD", match.group(0).lower())
    without_accents = "".join(c for c in folded if not unicodedata.combining(c))
    return " ".join(without_accents.split())


def _build_citation_index(registry: LawRegistry) -> dict[str, str]:
    """Map each law's leading title citation to its BOE id (#569).

    Lets the edge pass resolve textual references — which carry only the
    citation text ("Ley 39/2015"), not a BOE id — to in-corpus laws. First
    title wins on the rare collision; unmatched citations stay dangling.
    """
    index: dict[str, str] = {}
    for law_id in registry.law_ids:
        try:
            title = registry.get_metadata(law_id).title
        except (OSError, ValueError, LexFlowError):
            continue
        signature = _ref_signature(title)
        if signature and signature not in index:
            index[signature] = law_id
    return index


def build_graph(registry: LawRegistry) -> LegalGraph:
    graph = LegalGraph()
    # Pass 1: add all law nodes
    for law_id in registry.law_ids:
        try:
            meta = registry.get_metadata(law_id)
            graph.add_law(meta)
        # ``get_metadata`` reads/parses the source; OSError covers I/O,
        # ValueError covers parse/validation failures, LexFlowError is the
        # in-house surface (LawNotFoundError, ParserError, …).
        except (OSError, ValueError, LexFlowError):
            logger.warning("Could not add node for %s", law_id, exc_info=True)
    # Pass 2: add edges from cross-references. References to laws absent from
    # the corpus are parked as dangling so a later incremental add resolves
    # them; only resolved edges are counted for the log.
    added_edges = 0
    citation_index = _build_citation_index(registry)
    for law_id in registry.law_ids:
        try:
            law = registry.get_law(law_id)
            added_edges += _add_law_edges(graph, law_id, law, citation_index)
        except (OSError, ValueError, LexFlowError):
            logger.warning("Could not process references for %s", law_id, exc_info=True)
    logger.info("Graph built: %d nodes, %d edges", graph.node_count(), added_edges)
    return graph


def apply_diff_to_graph(graph: LegalGraph, registry: LawRegistry, diff: CorpusDiff) -> None:
    """Patch *graph* in place for the laws in *diff* (incremental sync, #230).

    Assumes ``registry.apply_corpus_diff`` already ran, so metadata and parsed
    laws for the affected IDs are current. Removed laws turn their incoming
    edges back into dangling references so a future re-add resolves them; added
    laws resolve any dangling references that were waiting on them.
    """
    citation_index = _build_citation_index(registry)
    for law_id in diff.removed:
        _remove_law_from_graph(graph, law_id)
    for law_id in diff.modified:
        _upsert_law(graph, registry, law_id, citation_index)
    for law_id in diff.added:
        _upsert_law(graph, registry, law_id, citation_index)
        _resolve_incoming(graph, law_id)


def _add_law_edges(graph: LegalGraph, law_id: str, law: Law, citation_index: dict[str, str]) -> int:
    """Add one law's outgoing edges; park unresolved targets as dangling.

    Returns the number of edges actually inserted (target was a known node).
    A reference without a BOE id is resolved against *citation_index* by its
    citation text ("Ley 39/2015"), which is how most cross-references in the
    corpus become edges at all (#569); self-citations are skipped. Propagates
    ``ref.kind`` (cites/modifies/repeals/develops, #144) into the edge
    attribute so frontend renders can colour by relation.
    """
    added = 0
    for ref in law.references:
        target_id = ref.target_id
        if not target_id:
            signature = _ref_signature(ref.target_text)
            resolved = citation_index.get(signature) if signature else None
            if not resolved or resolved == law_id:  # unknown citation or self-cite
                continue
            target_id = resolved
        inserted = graph.add_reference(
            law_id,
            target_id,
            source_article=ref.source_article,
            reference_text=ref.target_text,
            kind=ref.kind,
        )
        if inserted:
            added += 1
        else:
            graph.add_dangling(
                target_id,
                law_id,
                source_article=ref.source_article,
                reference_text=ref.target_text,
                kind=ref.kind,
            )
    return added


def _remove_law_from_graph(graph: LegalGraph, law_id: str) -> None:
    """Remove a law node; preserve its incoming refs as dangling."""
    for source, attrs in graph.incoming_edges(law_id):
        graph.add_dangling(
            law_id,
            source,
            source_article=attrs.get("source_article"),
            reference_text=attrs.get("reference_text", "") or "",
        )
    graph.drop_source_from_dangling(law_id)
    graph.remove_law(law_id)


def _upsert_law(graph: LegalGraph, registry: LawRegistry, law_id: str, citation_index: dict[str, str]) -> None:
    """Insert or refresh a law's node attributes and outgoing edges.

    Incoming edges are left untouched; only this law's own outgoing edges are
    rebuilt from its current references.
    """
    graph.add_law(registry.get_metadata(law_id))
    graph.drop_source_from_dangling(law_id)
    graph.clear_outgoing(law_id)
    _add_law_edges(graph, law_id, registry.get_law(law_id), citation_index)


def _resolve_incoming(graph: LegalGraph, law_id: str) -> None:
    """Turn references that were waiting on a now-added law into real edges.

    Carries ``kind`` forward from the dangling record so resolved edges
    keep the same relationship type as the original reference (#144).
    Older cached graphs that pre-date the typing fall back to ``cites``.
    """
    for ref in graph.pop_dangling(law_id):
        raw_kind = ref.get("kind") or ReferenceKind.CITES.value
        try:
            kind = ReferenceKind(raw_kind)
        except ValueError:
            kind = ReferenceKind.CITES
        graph.add_reference(
            ref["source"] or "",
            law_id,
            source_article=ref["source_article"],
            reference_text=ref["reference_text"] or "",
            kind=kind,
        )
