"""Tests for reference-kind classification (#144).

The heuristic looks at ~120 characters of context preceding each
citation. Tests pin down the four kinds, the precedence (REPEALS
> MODIFIES > DEVELOPS > CITES), and a couple of regressions.
"""

from __future__ import annotations

import pytest

from lexflow.core.enums import ReferenceKind
from lexflow.core.parser import extract_references


def _kinds(text: str) -> list[ReferenceKind]:
    """Shortcut: extract refs from ``text`` and return their kinds."""
    return [r.kind for r in extract_references(text)]


class TestSingleKinds:
    @pytest.mark.parametrize(
        "context",
        [
            "Queda derogada la Ley 1/1990",
            "Se deroga la Ley 1/1990",
            "Pierde su vigencia la Ley 1/1990",
        ],
    )
    def test_repeals_markers(self, context: str) -> None:
        assert _kinds(context) == [ReferenceKind.REPEALS]

    @pytest.mark.parametrize(
        "context",
        [
            "Se modifica la Ley 1/1990",
            "Modifica la Ley 1/1990",
            "Se da nueva redacción al artículo 5 de la Ley 1/1990",
            "Se sustituye la Ley 1/1990",
        ],
    )
    def test_modifies_markers(self, context: str) -> None:
        assert _kinds(context) == [ReferenceKind.MODIFIES]

    @pytest.mark.parametrize(
        "context",
        [
            "Esta norma desarrolla la Ley 1/1990",
            "En aplicación de la Ley 1/1990",
            "En cumplimiento de la Ley 1/1990",
        ],
    )
    def test_develops_markers(self, context: str) -> None:
        assert _kinds(context) == [ReferenceKind.DEVELOPS]

    def test_plain_cite_is_the_default(self) -> None:
        # No verb marker → fallback to ``cites``.
        kinds = _kinds("De conformidad con lo establecido en la Ley 1/1990")
        assert kinds == [ReferenceKind.CITES]


class TestPrecedence:
    def test_repeals_wins_over_modifies(self) -> None:
        # Two markers in the same context — REPEALS must win.
        text = "se modifica y queda derogada la Ley 1/1990"
        assert _kinds(text) == [ReferenceKind.REPEALS]

    def test_modifies_wins_over_develops(self) -> None:
        text = "esta norma desarrolla y modifica la Ley 1/1990"
        assert _kinds(text) == [ReferenceKind.MODIFIES]


class TestMultipleReferences:
    def test_each_reference_classified_independently(self) -> None:
        text = "Se modifica la Ley 1/1990 en su artículo 3. Lo dispuesto en la Ley 2/1995 sigue vigente."
        kinds = _kinds(text)
        assert kinds == [ReferenceKind.MODIFIES, ReferenceKind.CITES]


class TestRegression:
    def test_context_window_does_not_leak_from_prior_sentence(self) -> None:
        # A `deroga` ~200 chars earlier must NOT colour the later citation.
        text = (
            "Queda derogada la Ley 0/1900 por completo. "
            + ("Lorem ipsum dolor sit amet. " * 10)
            + "De conformidad con la Ley 9/2020."
        )
        kinds = _kinds(text)
        # First law parsed is Ley 0/1900 (REPEALS), second is Ley 9/2020.
        # Only the SECOND one is the regression target — must stay CITES
        # because the deroga is far outside its 120-char window.
        assert kinds[0] == ReferenceKind.REPEALS
        assert kinds[-1] == ReferenceKind.CITES

    def test_list_form_derogation_keeps_lead_in_context(self) -> None:
        # #823: the "Quedan derogadas..." lead-in sits on the line before
        # the "a)" list item — trimming at the newline right before "a)"
        # must not drop that lead-in sentence.
        text = (
            "2. Quedan derogadas expresamente las siguientes disposiciones:\n"
            "\n"
            "a) Ley 30/1992, de 26 de noviembre, de Régimen Jurídico de las "
            "Administraciones Públicas y del Procedimiento Administrativo Común.\n"
            "\n"
            "b) Ley 11/2007, de 22 de junio, de acceso electrónico de los "
            "ciudadanos a los Servicios Públicos.\n"
        )
        kinds = _kinds(text)
        assert kinds[0] == ReferenceKind.REPEALS

    def test_numbered_lead_in_before_lettered_list_item(self) -> None:
        # Edge case: a numbered lead-in ("1." / "2.") preceding lettered
        # items must still surface the repeal marker for the first item.
        text = "1. Quedan derogadas las siguientes normas:\n\na) Ley 5/2000, de 1 de enero."
        assert _kinds(text) == [ReferenceKind.REPEALS]

    def test_plain_cite_after_list_item_still_classifies_as_cites(self) -> None:
        # No repeal marker anywhere nearby — list-marker handling must not
        # invent a REPEALS classification out of thin air.
        text = "Véanse las siguientes normas:\n\na) Ley 5/2000, de 1 de enero."
        assert _kinds(text) == [ReferenceKind.CITES]
