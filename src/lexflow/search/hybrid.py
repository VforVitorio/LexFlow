"""Reciprocal Rank Fusion of full-text + semantic search (#43).

Full-text (keyword) and semantic (embedding) rankers score on
incomparable scales — the full-text engine returns substring-count
relevance (``>= 0``), the semantic index returns cosine similarity in
``[-1, 1]``. Normalising one onto the other is fragile, so we fuse by
**rank** instead of score: Reciprocal Rank Fusion (RRF, Cormack et al.
2009). Each candidate's fused score is the sum over rankers of
``1 / (k + rank)``, which rewards a document that ranks highly in EITHER
ranker and especially in BOTH, with no score-scale calibration.

Both rankers are article-level, so fusion keys on ``(law_id,
article_number)``. A full-text title-only hit (``article_number is
None``) simply forms its own fusion bucket.

--- WHERE TO CHANGE IF X CHANGES ---
* Fusion weighting        → :data:`RRF_K` / switch to weighted-sum here.
* Candidate pool depth    → :data:`_CANDIDATE_POOL`.
* Cross-encoder rerank    → a follow-up wraps this output (#43).
"""

from __future__ import annotations

from dataclasses import dataclass

from lexflow.core.registry import LawRegistry
from lexflow.search.semantic_index import SemanticIndex

# Canonical RRF constant from the original paper. Large enough that a #1
# in one ranker doesn't completely swamp a strong showing in the other.
RRF_K = 60

# Candidates pulled from each ranker before fusing. Wider than the final
# ``limit`` so a document ranked low in one ranker but high in the other
# can still surface in the fused top-K.
_CANDIDATE_POOL = 50

# Source labels recorded on each fused hit so the UI can badge how a
# result was found ("keyword", "meaning", or both).
FULL_TEXT_SOURCE = "full_text"
SEMANTIC_SOURCE = "semantic"


@dataclass(frozen=True)
class HybridHit:
    """One fused result.

    ``sources`` lists which rankers surfaced this article — a hit found by
    both is the strongest signal. ``score`` is the fused RRF score (not
    comparable to either ranker's native score).
    """

    law_id: str
    article_number: str | None
    snippet: str
    score: float
    sources: list[str]


def hybrid_search(
    registry: LawRegistry,
    semantic_index: SemanticIndex,
    query: str,
    *,
    limit: int = 10,
) -> list[HybridHit]:
    """Return the top-``limit`` articles by RRF over full-text + semantic.

    The semantic index must already be built (the caller warms it via
    ``ensure_semantic_index``); an empty semantic index just contributes
    nothing to the fusion and the result degrades to full-text order.
    """
    full_text_hits = registry.search_text(query, page=1, page_size=_CANDIDATE_POOL).items
    semantic_hits = semantic_index.query(query, limit=_CANDIDATE_POOL)
    fused = _fuse(full_text_hits, semantic_hits)
    return fused[:limit]


@dataclass
class _Bucket:
    """Mutable fusion accumulator for one ``(law_id, article_number)`` key."""

    law_id: str
    article_number: str | None
    snippet: str
    score: float
    sources: list[str]


def _fuse(full_text_hits: list, semantic_hits: list) -> list[HybridHit]:  # type: ignore[type-arg]
    """Reciprocal-rank-fuse the two ranked lists into one ordered list.

    Full-text snippets win when a document is found by both — they carry
    the keyword-match context the user typed, whereas the semantic snippet
    is just the article opening.
    """
    buckets: dict[tuple[str, str | None], _Bucket] = {}

    for rank, item in enumerate(full_text_hits):
        key = (item.law_id, item.article_number)
        bucket = buckets.get(key)
        contribution = 1.0 / (RRF_K + rank + 1)
        if bucket is None:
            buckets[key] = _Bucket(
                law_id=item.law_id,
                article_number=item.article_number,
                snippet=item.snippet,
                score=contribution,
                sources=[FULL_TEXT_SOURCE],
            )
        else:
            bucket.score += contribution
            bucket.sources.append(FULL_TEXT_SOURCE)

    for rank, hit in enumerate(semantic_hits):
        key = (hit.law_id, hit.article_number)
        bucket = buckets.get(key)
        contribution = 1.0 / (RRF_K + rank + 1)
        if bucket is None:
            buckets[key] = _Bucket(
                law_id=hit.law_id,
                article_number=hit.article_number,
                snippet=hit.snippet,
                score=contribution,
                sources=[SEMANTIC_SOURCE],
            )
        else:
            bucket.score += contribution
            bucket.sources.append(SEMANTIC_SOURCE)

    ordered = sorted(
        buckets.values(),
        # Descending fused score; ties broken deterministically by id so
        # the same corpus always yields the same order.
        key=lambda b: (-b.score, b.law_id, b.article_number or ""),
    )
    return [
        HybridHit(
            law_id=b.law_id,
            article_number=b.article_number,
            snippet=b.snippet,
            score=b.score,
            sources=b.sources,
        )
        for b in ordered
    ]
