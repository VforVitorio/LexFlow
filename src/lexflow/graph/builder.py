"""Build LegalGraph from LawRegistry."""

from __future__ import annotations

import logging

from lexflow.core.registry import LawRegistry
from lexflow.graph.model import LegalGraph

logger = logging.getLogger(__name__)


def build_graph(registry: LawRegistry) -> LegalGraph:
    graph = LegalGraph()
    # Pass 1: add all law nodes
    for law_id in registry.law_ids:
        try:
            meta = registry.get_metadata(law_id)
            graph.add_law(meta)
        except Exception:
            logger.warning("Could not add node for %s", law_id)
    # Pass 2: add edges from cross-references
    added_edges = 0
    for law_id in registry.law_ids:
        try:
            law = registry.get_law(law_id)
            for ref in law.references:
                if ref.target_id:
                    graph.add_reference(
                        law_id,
                        ref.target_id,
                        source_article=ref.source_article,
                        reference_text=ref.target_text,
                    )
                    added_edges += 1
        except Exception:
            logger.warning("Could not process references for %s", law_id)
    logger.info("Graph built: %d nodes, %d edges", graph.node_count(), added_edges)
    return graph
