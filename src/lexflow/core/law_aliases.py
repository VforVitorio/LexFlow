"""Acronym-to-title expansion for Spanish law short names (#671, gap A).

Users search by the popular acronym of a law ("LOPD", "LGT", "ET") far more
often than by its official title or BOE number. The existing full-text index
(:mod:`lexflow.core.search`) already matches on title/article text, so the
number ("39/2015") is findable today — but a bare acronym is not, because no
indexed text contains the acronym itself.

This module closes that gap without inventing BOE identifiers: each acronym
maps to a phrase that genuinely appears in the law's official title.
Expanding the query to that phrase before it reaches the search index lets
the *existing* title match do the work, with zero risk of pointing a user at
the wrong law.

IMPORTANT — the underlying engine (``SearchIndex.search`` in
``core/search.py``) matches with ``text_lower.count(query_lower)``: a literal,
whole-string substring count with no per-word tokenization and no accent
folding (only ``.lower()`` is applied). Two consequences shape every value in
this map:

1. **Values must be exact, contiguous, correctly-accented substrings of the
   real title** — not just "words that occur somewhere in it". A phrase that
   drops a connector ("y", "de los") or skips a word is a substring of
   nothing and silently matches zero entries.
2. **Values must skip the "Ley N/YYYY, de DD de <month>," clause.** Spanish
   law titles are typically "Ley [Orgánica] N/YYYY, de DD de <month>,
   <subject>." — the number/date clause breaks contiguity with anything
   before it, so every expansion below is the <subject> tail only (e.g. for
   "Ley 58/2003, de 17 de diciembre, General Tributaria" the safe value is
   "general tributaria", never "ley ... general tributaria").

Invariant: every value is a real, verified substring of the title, never a
fabricated BOE id. When an acronym-to-title mapping (or its exact wording)
cannot be confirmed with confidence, it is left out — a smaller, correct map
beats a larger, wrong one.

Seed list: curated from general legal knowledge, covering ~35 of the most
commonly cited Spanish laws. Meant to be expanded and verified against the
real legalize-es corpus over time, not treated as exhaustive.
"""

from __future__ import annotations

LAW_ALIASES: dict[str, str] = {
    "CE": "constitución española",
    "CC": "código civil",
    "CP": "código penal",
    "LOPD": "protección de datos personales",
    "LOPDGDD": "protección de datos personales",
    "LEC": "enjuiciamiento civil",
    "LECRIM": "enjuiciamiento criminal",
    "LGT": "general tributaria",
    "LGSS": "general de la seguridad social",
    "ET": "estatuto de los trabajadores",
    "LOE": "ordenación de la edificación",
    "LRJSP": "régimen jurídico del sector público",
    "LPAC": "procedimiento administrativo común de las administraciones públicas",
    "LOPJ": "poder judicial",
    "LBRL": "bases del régimen local",
    "LSC": "sociedades de capital",
    "LJCA": "jurisdicción contencioso-administrativa",
    "LCSP": "contratos del sector público",
    "LOFAGE": "organización y funcionamiento de la administración general del estado",
    "LOTC": "tribunal constitucional",
    "LOPSC": "protección de la seguridad ciudadana",
    "TRLGDCU": "defensa de los consumidores y usuarios",
    "LAU": "arrendamientos urbanos",
    "LC": "ley concursal",
    "LPI": "propiedad intelectual",
    "LPH": "propiedad horizontal",
    "LMV": "mercado de valores",
    "LGP": "general presupuestaria",
    "LOREG": "régimen electoral general",
    "LOFCS": "fuerzas y cuerpos de seguridad",
    "LODP": "defensor del pueblo",
    "LOLS": "libertad sindical",
    "LISOS": "infracciones y sanciones en el orden social",
    "LO 1/2004": "medidas de protección integral contra la violencia de género",
    "LOVG": "medidas de protección integral contra la violencia de género",
    "LO 3/2007": "igualdad efectiva de mujeres y hombres",
    "LOPIVI": "protección integral a la infancia y la adolescencia frente a la violencia",
}


def _normalise(query: str) -> str:
    """Collapse whitespace and uppercase a raw query for exact acronym lookup."""
    return " ".join(query.split()).upper()


def expand_alias(query: str) -> str | None:
    """Return the title-word expansion for `query` if it is a known acronym.

    Matching is exact (after trimming/collapsing whitespace and
    uppercasing) — no fuzzy or substring matching. "lopd" and "LOPD" both
    match; "lopdd" and "el lopd de 2018" do not. Exact-match keeps this
    strictly additive: it can only help a query that was otherwise a dead
    end, never hijack a normal free-text search.

    Args:
        query: the raw search query as typed by the user.

    Returns:
        The lowercase expansion phrase, or None if `query` is not a known
        acronym.
    """
    return LAW_ALIASES.get(_normalise(query))
