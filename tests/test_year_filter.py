"""Year-range filtering in :func:`apply_law_filters` (#563).

The Explorer year inputs were decorative until #563; these guard the
backend half so a publication-year range narrows the list as expected
and a law with no publication date is excluded from any year query.
"""

from __future__ import annotations

from datetime import date

from lexflow.core.enums import LawRank, LawStatus, Scope
from lexflow.core.schemas import LawSummary
from lexflow.core.services import apply_law_filters


def _summary(identifier: str, published: date | None) -> LawSummary:
    return LawSummary(
        identifier=identifier,
        title=f"Law {identifier}",
        rank=LawRank.LEY,
        status=LawStatus.IN_FORCE,
        publication_date=published,
        article_count=1,
        scope=Scope.ESTATAL,
        jurisdiction=None,
    )


_SUMMARIES = [
    _summary("A-1978", date(1978, 12, 6)),
    _summary("B-2000", date(2000, 1, 15)),
    _summary("C-2020", date(2020, 6, 30)),
    _summary("D-none", None),
]


def _ids(summaries: list[LawSummary]) -> set[str]:
    return {s.identifier for s in summaries}


def _filter(**kwargs: object) -> list[LawSummary]:
    base: dict[str, object] = {"rank": None, "status": None, "scope": None, "jurisdiction": None}
    base.update(kwargs)
    return apply_law_filters(_SUMMARIES, **base)  # type: ignore[arg-type]


def test_year_from_is_inclusive_lower_bound() -> None:
    assert _ids(_filter(year_from=2000)) == {"B-2000", "C-2020"}


def test_year_to_is_inclusive_upper_bound() -> None:
    assert _ids(_filter(year_to=2000)) == {"A-1978", "B-2000"}


def test_year_range_narrows_to_a_single_law() -> None:
    assert _ids(_filter(year_from=1990, year_to=2010)) == {"B-2000"}


def test_law_without_publication_date_is_excluded_from_year_query() -> None:
    # "D-none" has no date, so it can't satisfy any bounded range.
    assert "D-none" not in _ids(_filter(year_from=1900, year_to=2100))


def test_no_year_bounds_keeps_every_law_including_undated() -> None:
    assert _ids(_filter()) == {"A-1978", "B-2000", "C-2020", "D-none"}
