"""LawRank covers every rank present in the live corpus (#549).

Real ranks (``orden``, ``resolucion``, ``decreto_ley``, leyes forales, …)
used to bucket into ``OTRO`` because the enum didn't model them — breaking
the Explorer rank filter and rank-based analytics for ~5k laws. The values
below were audited from the legalize-es frontmatter (``grep ^rank:`` over
the corpus). ``OTRO`` stays the genuine catch-all for unmodelled values.
"""

from __future__ import annotations

import pytest

from lexflow.core.enums import LawRank

# Distinct, non-trivial ranks observed in the corpus (excludes the already
# long-modelled ley/ley_organica/real_decreto* and the otro catch-all).
CORPUS_RANKS = [
    "orden",
    "resolucion",
    "decreto",
    "decreto_ley",
    "ley_foral",
    "circular",
    "instruccion",
    "acuerdo",
    "acuerdo_internacional",
    "decreto_ley_foral",
    "decreto_foral_legislativo",
    "reglamento",
    "constitucion",
]


@pytest.mark.parametrize("raw", CORPUS_RANKS)
def test_corpus_rank_has_dedicated_member(raw: str) -> None:
    """Each audited corpus rank coerces to its own member, not OTRO."""
    coerced = LawRank(raw)
    assert coerced is not LawRank.OTRO
    assert coerced.value == raw


def test_unknown_rank_still_raises_for_safe_enum_fallback() -> None:
    """A value the corpus doesn't have must NOT silently become a member —
    it raises so ``_safe_enum`` routes it to OTRO (the intended catch-all)."""
    with pytest.raises(ValueError):
        LawRank("not_a_real_rank")
