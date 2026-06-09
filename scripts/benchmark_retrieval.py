"""Retrieval-quality benchmark: full-text vs semantic vs hybrid (#43).

The sprint-4 acceptance gate is "hybrid beats semantic and full-text
on top-K accuracy over a set of hand-curated queries". That comparison is
only meaningful with the REAL embedder over the REAL corpus, which needs
torch — so it lives here as a manual script, NOT a CI test (CI never
installs the ``[semantic]`` extra). The deterministic fusion-quality unit
tests in ``tests/test_hybrid_search.py`` cover the logic in CI.

Run it:

    # placeholder HashEmbedder (proves the harness; rankings are not semantic)
    uv run python scripts/benchmark_retrieval.py

    # real comparison (downloads the model on first run):
    LEXFLOW_EMBEDDER=sentence-transformers uv run python scripts/benchmark_retrieval.py
    # add cross-encoder re-rank on top of hybrid:
    LEXFLOW_EMBEDDER=sentence-transformers LEXFLOW_RERANK=cross-encoder \\
        uv run python scripts/benchmark_retrieval.py

--- WHERE TO CHANGE IF X CHANGES ---
* Ground truth        → :data:`QUERIES` (curate against your corpus).
* Metric              → :func:`_top_k_accuracy` (currently hit@K).
"""

from __future__ import annotations

from dataclasses import dataclass

from lexflow.core.registry import get_registry
from lexflow.search.hybrid import hybrid_search
from lexflow.search.reranker_factory import build_reranker
from lexflow.search.service import ensure_semantic_index
from lexflow.utils.config import get_settings

TOP_K = 5


@dataclass(frozen=True)
class BenchmarkQuery:
    """A query plus the law ids considered relevant for it.

    Curate these against the live legalize-es corpus — the defaults below
    are illustrative starting points, not a validated gold set.
    """

    query: str
    relevant_law_ids: frozenset[str]


# EDIT ME: hand-curated (query → relevant law ids) pairs. Pick conceptual
# / paraphrased queries where keyword search alone struggles, so the
# semantic + hybrid lift is visible.
QUERIES: list[BenchmarkQuery] = [
    BenchmarkQuery("protección de datos personales", frozenset({"BOE-A-2018-16673"})),
    BenchmarkQuery("derechos digitales de la ciudadanía", frozenset({"BOE-A-2018-16673"})),
    BenchmarkQuery("enjuiciamiento civil", frozenset({"BOE-A-2000-323"})),
]


def _law_ids(hits: list[object]) -> list[str]:
    """Pull the ``law_id`` off whatever hit dataclass a ranker returns."""
    return [getattr(hit, "law_id", "") for hit in hits]


def _top_k_accuracy(per_query_ranked_ids: list[list[str]], queries: list[BenchmarkQuery], k: int) -> float:
    """Fraction of queries whose top-``k`` contains a relevant law id."""
    if not queries:
        return 0.0
    hits = 0
    for ranked_ids, bq in zip(per_query_ranked_ids, queries, strict=True):
        top = ranked_ids[:k]
        if any(law_id in bq.relevant_law_ids for law_id in top):
            hits += 1
    return hits / len(queries)


def _run_rankers(queries: list[BenchmarkQuery]) -> dict[str, list[list[str]]]:
    """Run every ranker over every query, returning ranked law ids per query."""
    registry = get_registry()
    semantic_index = ensure_semantic_index(registry)
    reranker = build_reranker()

    full_text: list[list[str]] = []
    semantic: list[list[str]] = []
    hybrid: list[list[str]] = []
    hybrid_reranked: list[list[str]] = []

    for bq in queries:
        ft_hits = registry.search_text(bq.query, page=1, page_size=TOP_K).items
        full_text.append([h.law_id for h in ft_hits])
        semantic.append(_law_ids(semantic_index.query(bq.query, limit=TOP_K)))
        hybrid.append(_law_ids(hybrid_search(registry, semantic_index, bq.query, limit=TOP_K)))
        if reranker is not None:
            hybrid_reranked.append(
                _law_ids(hybrid_search(registry, semantic_index, bq.query, limit=TOP_K, reranker=reranker))
            )

    results = {"full_text": full_text, "semantic": semantic, "hybrid": hybrid}
    if reranker is not None:
        results["hybrid+rerank"] = hybrid_reranked
    return results


def _print_report(results: dict[str, list[list[str]]], queries: list[BenchmarkQuery]) -> None:
    """Print the top-K accuracy of each ranker as a small table."""
    settings = get_settings()
    print(f"Corpus: {settings.data_path}")
    print(f"Embedder: {settings.embedder_backend} ({settings.embedder_model})")
    print(f"Re-ranker: {settings.rerank_backend}")
    print(f"Queries: {len(queries)}  |  metric: hit@{TOP_K}\n")
    print(f"{'ranker':<16} top-{TOP_K} accuracy")
    print("-" * 32)
    for name, ranked in results.items():
        accuracy = _top_k_accuracy(ranked, queries, TOP_K)
        print(f"{name:<16} {accuracy:.2%}")


def main() -> None:
    """Build the index, run every ranker, and print the comparison."""
    results = _run_rankers(QUERIES)
    _print_report(results, QUERIES)


if __name__ == "__main__":
    main()
