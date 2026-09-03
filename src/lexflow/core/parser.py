"""Parser for legalize-es Markdown law files.

Transforms a ``.md`` file with YAML frontmatter and structured headings
into a :class:`~lexflow.core.models.Law` domain model.

The parser is composed of small, single-responsibility functions that are
assembled by the top-level :func:`parse_law_file` entry point.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from pathlib import Path
from typing import Any

import yaml

from lexflow.core.enums import (
    ConsolidationStatus,
    DisposicionKind,
    Jurisdiction,
    LawRank,
    LawStatus,
    ReferenceKind,
    Scope,
)
from lexflow.core.exceptions import ParserError
from lexflow.core.models import Article, Disposicion, Law, LawMetadata, Reference, Section

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Frontmatter
# ---------------------------------------------------------------------------

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def split_frontmatter(content: str) -> tuple[str, str]:
    """Split a Markdown file into ``(frontmatter_yaml, body_markdown)``.

    Returns ``("", content)`` when no frontmatter delimiters are found.
    """
    match = _FRONTMATTER_RE.match(content)
    if match is None:
        return "", content
    yaml_text = match.group(1)
    body = content[match.end() :]
    return yaml_text, body


def parse_frontmatter(yaml_text: str) -> dict[str, Any]:
    """Parse a YAML frontmatter string into a raw dictionary.

    Raises :class:`ParserError` for malformed YAML (via *file_path* context
    provided by the caller).
    """
    if not yaml_text.strip():
        return {}
    try:
        data = yaml.safe_load(yaml_text)
    except yaml.YAMLError as exc:
        raise ParserError("<unknown>", f"Invalid YAML frontmatter: {exc}") from exc
    return data if isinstance(data, dict) else {}


def _safe_enum(enum_cls: type, value: Any, default: Any) -> Any:
    """Convert *value* to *enum_cls*, falling back to *default*.

    Emits a structured warning when the value is non-null but unknown so
    upstream data drift surfaces in logs instead of silently bucketing
    into the default (#104 cross-cutting). Pure ``None`` stays silent —
    that's the documented "field absent" path.
    """
    if value is None:
        return default
    try:
        return enum_cls(value)
    except ValueError:
        logger.warning(
            "Unknown %s value %r — falling back to %r",
            enum_cls.__name__,
            value,
            default,
        )
        return default


# #145 — tag normalisation. The frontmatter expresses topics under
# `tags`, `categories`, `keywords` and/or `subjects` (the key legalize-es
# actually uses, e.g. `subjects: ["Cementerios", "Defunciones"]`), with values
# that may be a list or a comma-separated string. We fold them all into one
# normalised, de-duplicated, order-preserving list of kebab-case ASCII slugs so
# the `/api/v1/tags` vocabulary is consistent regardless of source spelling.
# Without `subjects` the whole corpus parsed to zero tags, so #tag search, the
# tag chips and the tag filter showed nothing (#669).

_TAG_SOURCE_KEYS = ("tags", "categories", "keywords", "subjects")
_TAG_SLUG_RE = re.compile(r"[^a-z0-9]+")


def normalize_tag(raw: str) -> str:
    """Normalise a raw tag to a kebab-case ASCII slug.

    ``"Protección de Datos"`` → ``"proteccion-de-datos"``. Strips
    accents, lowercases, collapses any non-alphanumeric run to a single
    hyphen, and trims leading/trailing hyphens. Returns ``""`` for input
    that has no alphanumeric content (the caller drops empties).
    """
    decomposed = unicodedata.normalize("NFKD", raw)
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _TAG_SLUG_RE.sub("-", ascii_only.lower()).strip("-")


def _coerce_tag_values(value: Any) -> list[str]:
    """Coerce one frontmatter tag field to a list of raw strings.

    Accepts a list (``[a, b]``) or a comma/semicolon-separated string
    (``"a, b; c"``). Anything else yields an empty list.
    """
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        return [part for part in re.split(r"[,;]", value)]
    return []


def extract_tags(raw: dict[str, Any]) -> list[str]:
    """Pull + normalise tags from the ``tags``/``categories``/``keywords``
    frontmatter fields into one de-duplicated, order-preserving list.
    """
    seen: dict[str, None] = {}  # dict preserves insertion order, acts as ordered set
    for key in _TAG_SOURCE_KEYS:
        for candidate in _coerce_tag_values(raw.get(key)):
            slug = normalize_tag(candidate)
            if slug:
                seen.setdefault(slug, None)
    return list(seen)


def frontmatter_to_metadata(raw: dict[str, Any]) -> LawMetadata:
    """Convert a raw frontmatter dict to a validated :class:`LawMetadata`.

    Handles missing fields, unknown enum values and date coercion gracefully.
    """
    return LawMetadata(
        identifier=str(raw.get("identifier", "")),
        title=str(raw.get("title", "")),
        rank=_safe_enum(LawRank, raw.get("rank"), LawRank.OTRO),
        status=_safe_enum(LawStatus, raw.get("status"), LawStatus.IN_FORCE),
        publication_date=raw.get("publication_date"),
        enactment_date=raw.get("enactment_date"),
        last_updated=raw.get("last_updated"),
        source=raw.get("source"),
        department=raw.get("department"),
        official_journal=raw.get("official_journal"),
        journal_issue=str(raw["journal_issue"]) if raw.get("journal_issue") is not None else None,
        consolidation_status=_safe_enum(
            ConsolidationStatus,
            raw.get("consolidation_status"),
            ConsolidationStatus.UNKNOWN,
        ),
        scope=_safe_enum(Scope, raw.get("scope"), Scope.ESTATAL),
        jurisdiction=_safe_enum(Jurisdiction, raw.get("jurisdiction"), None),
        country=str(raw.get("country", "es")),
        tags=extract_tags(raw),
        category=str(raw["category"]) if raw.get("category") is not None else None,
    )


# ---------------------------------------------------------------------------
# Heading / section tree
# ---------------------------------------------------------------------------

_HEADING_RE = re.compile(r"^(#{1,5})\s+(.+)$", re.MULTILINE)


def extract_heading_tree(body: str) -> list[Section]:
    """Parse Markdown headings into a nested :class:`Section` tree.

    Walks the body line-by-line, using heading depth to establish
    parent/child relationships.
    """
    matches: list[tuple[int, str, int]] = []  # (level, heading, start_pos)
    for m in _HEADING_RE.finditer(body):
        level = len(m.group(1))
        heading = m.group(2).strip()
        matches.append((level, heading, m.start()))

    if not matches:
        return []

    return _build_section_list(body, matches, target_level=0)


def _build_section_list(
    body: str,
    matches: list[tuple[int, str, int]],
    target_level: int,
    start_idx: int = 0,
    end_idx: int | None = None,
    body_end: int | None = None,
) -> list[Section]:
    """Recursively build sections for headings at *target_level* depth.

    *target_level* of 0 means "find the minimum level and use that".

    *body_end* is the byte offset where this slice's content ends — the
    parent section's boundary. The LAST section at each level must stop
    there, NOT at ``len(body)``; otherwise the deepest trailing section
    swallowed every later article and inflated the nested count (#570).
    """
    if end_idx is None:
        end_idx = len(matches)
    if body_end is None:
        body_end = len(body)

    subset = matches[start_idx:end_idx]
    if not subset:
        return []

    if target_level == 0:
        target_level = min(level for level, _, _ in subset)

    sections: list[Section] = []
    i = 0
    while i < len(subset):
        level, heading, _ = subset[i]
        if level != target_level:
            i += 1
            continue

        # Find the end of this section (next heading at same or higher level)
        j = i + 1
        while j < len(subset) and subset[j][0] > target_level:
            j += 1

        # Content between this heading and the next at same level. The
        # last section stops at the parent's boundary (``body_end``), not
        # the end of the whole document — see #570.
        content_start = subset[i][2]
        content_end = subset[j][2] if j < len(subset) else body_end

        # Recurse for subsections. Audit #409: passing ``target_level + 1``
        # silently dropped sections when a parent's first subheading
        # skipped a depth (e.g. level 2 → level 4 with no level 3 in
        # between). Passing ``0`` makes the recursion pick the actual
        # minimum level present in the slice, so deeper headings stay
        # in the tree.
        subsections = _build_section_list(
            body,
            subset,
            target_level=0,
            start_idx=i + 1,
            end_idx=i + (j - i),
            body_end=content_end,
        )

        # Extract articles from this section's DIRECT content only — the
        # span from this heading to its first subheading. Using the full
        # ``section_body`` (which includes every subsection's content)
        # made each ancestor re-extract its descendants' articles, so a
        # law's nested article count ballooned far past its real total
        # (958 vs 169 for the Constitution — #570). Subsections collect
        # their own articles via the recursion above.
        first_sub_start = subset[i + 1][2] if (i + 1) < j else content_end
        direct_body = body[content_start:first_sub_start]
        articles = extract_articles(direct_body)

        sections.append(
            Section(
                level=level,
                heading=heading,
                articles=articles,
                subsections=subsections,
            )
        )
        i = j

    return sections


# ---------------------------------------------------------------------------
# Article extraction
# ---------------------------------------------------------------------------

# Article headings in legalize-es are markdown level 6 (``###### Artículo N``).
# The pattern allows ``#{1,6}`` (NOT ``#{1,5}``): the real corpus uses six
# hashes, so capping at five silently extracted ZERO articles from every law
# (the test fixture used five hashes, which masked it). See #561.
#
# The heading tail splits into number + optional title (#822): the corpus
# format is ``Artículo 1. Objeto de la Ley.`` — capturing the whole tail as
# the number made ``find_article(law, "1")`` miss every titled article and
# 404'd ``/articles/1``. All separators are horizontal whitespace (``[ \t]``)
# so the optional title group can never leak onto the following line.
# Group 3 is a fallback for tails that don't fit ``number[. title]`` (rare
# exotic numberings): keep the old whole-tail behaviour rather than dropping
# the article entirely.
_ARTICLE_NUMBER_PATTERN = r"\d+(?:[ \t]+(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))*"
# The leading ``#{1,6}`` heading marker is REQUIRED (#824): making it
# optional let any body line matching "Artículo N" act as an article
# boundary, e.g. a table cell or cross-reference mid-paragraph. On
# BOE-A-2021-21097 (340 real headings) that inflated the parse to 1,573
# "articles" — most of them phantom, carrying a sentence fragment as
# their whole body instead of a real article.
_ARTICLE_RE = re.compile(
    r"^#{1,6}[ \t]+Art[ií]culo[ \t]+"
    r"(?:(" + _ARTICLE_NUMBER_PATTERN + r")(?:\.[ \t]+(.+?))?\.?[ \t]*$"
    r"|(.+?)\.?\s*$)",
    re.MULTILINE | re.IGNORECASE,
)

# Plural range headings collapse a run of (usually repealed) articles into
# one heading, e.g. ``Artículos 325 a 332. (Derogados)`` (#824). Note the
# extra ``s`` on ``Artículos`` — that alone already keeps this pattern from
# ever colliding with ``_ARTICLE_RE`` (which requires whitespace right
# after ``Articulo``, not a trailing ``s``).
_ARTICLE_RANGE_RE = re.compile(
    r"^#{1,6}[ \t]+Art[ií]culos[ \t]+(\d+)[ \t]+a[ \t]+(\d+)\.?[ \t]*$",
    re.MULTILINE | re.IGNORECASE,
)

# Any heading line, used to bound a range heading's own text block —
# stops at the next heading of ANY kind (unlike ``_extract_article_text``,
# which deliberately keeps reading through nested "Articulo" headings
# because those already have their own boundary from ``_ARTICLE_RE``).
_ANY_HEADING_LINE_RE = re.compile(r"^#{1,6}[ \t]+\S", re.MULTILINE)


def extract_articles(body: str) -> list[Article]:
    """Extract all articles from a Markdown body.

    Finds ``Articulo N.`` patterns, splitting each heading into the article
    number and its optional title (``Artículo 1. Objeto de la Ley.`` →
    number ``"1"``, title ``"Objeto de la Ley"`` — #822), and captures text
    until the next article heading or section heading.
    """
    matches = list(_ARTICLE_RE.finditer(body))
    entries: list[tuple[int, Article]] = []
    for idx, match in enumerate(matches):
        number = (match.group(1) or match.group(3)).strip()
        raw_title = match.group(2)
        title = raw_title.strip() if raw_title else None
        text_start = match.end()
        text_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        raw_text = _extract_article_text(body[text_start:text_end])
        references = extract_references(raw_text, source_article=number)
        entries.append((match.start(), _build_article(number, title, raw_text, references)))

    existing_numbers = {article.number for _, article in entries}
    entries.extend(_extract_range_placeholder_articles(body, existing_numbers))
    entries.sort(key=lambda entry: entry[0])
    return [article for _, article in entries]


def _extract_range_placeholder_articles(body: str, existing_numbers: set[str]) -> list[tuple[int, Article]]:
    """Materialise placeholder articles for plural range headings (#824).

    Without this, a heading like ``Artículos 325 a 332. (Derogados)`` left
    every number in the range unreachable via :func:`find_article` — a
    404 indistinguishable from real data loss, when the law actually says
    exactly why the article is gone. Only numbers with no individual
    heading of their own get a placeholder; an explicit ``Artículo 330``
    heading elsewhere in the same body always wins and is left untouched.

    Returns ``(position, article)`` pairs — the range heading's own start
    offset, in each entry — so :func:`extract_articles` can slot the
    placeholders back into document order instead of dumping them all at
    the end of the flat list.
    """
    seen = set(existing_numbers)
    placeholders: list[tuple[int, Article]] = []
    for match in _ARTICLE_RANGE_RE.finditer(body):
        low, high = int(match.group(1)), int(match.group(2))
        text_start = match.end()
        next_heading = _ANY_HEADING_LINE_RE.search(body, text_start)
        text_end = next_heading.start() if next_heading else len(body)
        raw_text = body[text_start:text_end].strip()
        for number in range(low, high + 1):
            number_str = str(number)
            if number_str in seen:
                continue
            seen.add(number_str)
            references = extract_references(raw_text, source_article=number_str)
            placeholders.append((match.start(), _build_article(number_str, None, raw_text, references)))
    return placeholders


# Audit #409 perf: ``_extract_article_text`` runs per article body and
# compares each line against two patterns. Hoisting the regexes to
# module scope avoids 2-5 million ``re.compile`` calls during a cold
# parse of the 12 k-law corpus.
_SECTION_BREAK_RE = re.compile(r"^#{1,6}\s+")
_INLINE_ARTICLE_HEADING_RE = re.compile(r"^#{1,6}\s+Art[ií]culo", re.IGNORECASE)


def _extract_article_text(raw: str) -> str:
    """Clean raw text between two article headings.

    Strips leading/trailing whitespace and stops at the next non-article
    heading of any level (``#`` through ``######`` without 'Articulo'),
    including a disposicion heading (``###### Disposición adicional ...``
    etc — #823, #823). Disposiciones use the same heading level as
    articles (six hashes), so without this check the LAST article of a
    law swallowed the entire disposiciones block as its own body (Ley
    39/2015's 15 derogatoria references mis-attributed to "art. 133").
    The explicit ``_DISPOSICION_HEADING_RE`` check below is now largely
    redundant with the level 1-6 ``_SECTION_BREAK_RE`` but is kept for
    clarity and as a safety net.
    """
    lines: list[str] = []
    for line in raw.split("\n"):
        is_section_break = _SECTION_BREAK_RE.match(line) and not _INLINE_ARTICLE_HEADING_RE.match(line)
        if is_section_break or _DISPOSICION_HEADING_RE.match(line):
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _build_article(number: str, title: str | None, text: str, references: list[Reference]) -> Article:
    """Construct an :class:`Article` instance from parsed components."""
    return Article(
        number=number,
        title=title,
        text=text,
        references=references,
    )


# ---------------------------------------------------------------------------
# Ordinal operative clauses (#824) — fallback for article-less norms
# ---------------------------------------------------------------------------

# 1,857 laws (15.2% of the corpus) have zero ``Artículo`` headings; ~38% of
# those structure their operative text as numbered ordinals instead
# (``Primero.``, ``Segundo.``, ..., ``Único.``) — e.g. Junta Electoral
# Central instructions. Accent variants (``Décimo``/``Decimo``) and case
# variants (``PRIMERO``) are both tolerated; ``_canonical_ordinal_label``
# folds them to one consistent display form for lookup stability.
_ORDINAL_LABEL_PATTERN = (
    r"Primer[oa]|Segund[oa]|Tercer[oa]|Cuart[oa]|Quint[oa]|Sext[oa]|"
    r"S[eé]ptim[oa]|Octav[oa]|Noven[oa]|D[eé]cim[oa]|Und[eé]cim[oa]|"
    r"Duod[eé]cim[oa]|[UÚ]nic[oa]"
)
_ORDINAL_RE = re.compile(
    r"^#{1,6}[ \t]+(" + _ORDINAL_LABEL_PATTERN + r")(?:\.[ \t]+(.+?))?\.?[ \t]*$",
    re.MULTILINE | re.IGNORECASE,
)

_ORDINAL_CANONICAL: dict[str, str] = {
    "primero": "Primero",
    "primera": "Primera",
    "segundo": "Segundo",
    "segunda": "Segunda",
    "tercero": "Tercero",
    "tercera": "Tercera",
    "cuarto": "Cuarto",
    "cuarta": "Cuarta",
    "quinto": "Quinto",
    "quinta": "Quinta",
    "sexto": "Sexto",
    "sexta": "Sexta",
    "septimo": "Séptimo",
    "septima": "Séptima",
    "octavo": "Octavo",
    "octava": "Octava",
    "noveno": "Noveno",
    "novena": "Novena",
    "decimo": "Décimo",
    "decima": "Décima",
    "undecimo": "Undécimo",
    "undecima": "Undécima",
    "duodecimo": "Duodécimo",
    "duodecima": "Duodécima",
    "unico": "Único",
    "unica": "Única",
}


def _canonical_ordinal_label(raw: str) -> str:
    """Fold an ordinal label's accent/case variants to one display form.

    ``"PRIMERO"``, ``"Primero"`` and (a corpus typo) ``"primero"`` all
    become ``"Primero"``; falls back to ``str.capitalize()`` for any
    label not in the table rather than dropping it.
    """
    decomposed = unicodedata.normalize("NFKD", raw.strip())
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _ORDINAL_CANONICAL.get(ascii_only.lower(), raw.strip().capitalize())


def extract_ordinal_articles(body: str) -> list[Article]:
    """Extract ordinal operative clauses as a fallback article list.

    Only meaningful when :func:`extract_articles` finds zero real
    ``Artículo`` headings — callers (:func:`parse_law_content`) must gate
    on that so article-bearing norms are never touched by this fallback.
    """
    matches = list(_ORDINAL_RE.finditer(body))
    if not matches:
        return []

    articles: list[Article] = []
    for idx, match in enumerate(matches):
        label = _canonical_ordinal_label(match.group(1))
        raw_title = match.group(2)
        title = raw_title.strip() if raw_title else None
        text_start = match.end()
        text_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        raw_text = _extract_article_text(body[text_start:text_end])
        references = extract_references(raw_text, source_article=label)
        articles.append(_build_article(label, title, raw_text, references))

    return articles


# ---------------------------------------------------------------------------
# Disposicion extraction (#823)
# ---------------------------------------------------------------------------

# Disposicion headings in legalize-es are markdown level 6, same as
# Articulo headings: ``###### Disposición adicional primera.``. The tail
# after the kind word is free-form: bare (``Disposición derogatoria.``),
# with only an ordinal (``Disposición adicional primera.``), or with both
# an ordinal and a title sentence (``Disposición derogatoria única.
# Derogación normativa.``). Group 1 captures the full heading text (sans
# hashes) for the ``heading`` field, group 2 the kind, group 3 the tail —
# split further by ``_split_disposicion_tail``.
_DISPOSICION_KIND_PATTERN = r"adicional|transitoria|derogatoria|final"
_DISPOSICION_RE = re.compile(
    r"^#{1,6}[ \t]+(Disposici[oó]n[ \t]+(" + _DISPOSICION_KIND_PATTERN + r")(.*))$",
    re.MULTILINE | re.IGNORECASE,
)

# Used by ``_extract_article_text`` to stop an article's body before a
# trailing disposicion block, and to bound each disposicion's own text.
_DISPOSICION_HEADING_RE = re.compile(
    r"^#{1,6}[ \t]+Disposici[oó]n[ \t]+(?:" + _DISPOSICION_KIND_PATTERN + r")\b",
    re.IGNORECASE,
)


def extract_disposiciones(body: str) -> list[Disposicion]:
    """Extract all closing dispositions from a Markdown body.

    Finds ``Disposición adicional|transitoria|derogatoria|final`` headings
    and captures text until the next disposicion heading or the end of the
    document.
    """
    matches = list(_DISPOSICION_RE.finditer(body))
    if not matches:
        return []

    disposiciones: list[Disposicion] = []
    for idx, match in enumerate(matches):
        heading = match.group(1).strip()
        kind = match.group(2).lower()
        number, title = _split_disposicion_tail(match.group(3))
        text_start = match.end()
        text_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        raw_text = _extract_article_text(body[text_start:text_end])
        source = _disposicion_source_label(kind, number)
        references = extract_references(raw_text, source_article=source)
        disposiciones.append(_build_disposicion(heading, kind, number, title, raw_text, references))

    return disposiciones


def _disposicion_source_label(kind: str, number: str | None) -> str:
    """Build a reference ``source_article`` label for a disposición (#823).

    References found inside a disposición's text were previously left
    unattributed (``source_article=None``), which made ``Reference``
    lookups fall back to whatever the last parsed article happened to
    be. ``"disposición <kind> <number>"`` (e.g. ``"disposición
    derogatoria única"``) mirrors how the law itself names the
    disposición, so it stays legible without introducing a new field.
    """
    if number:
        return f"disposición {kind} {number}"
    return f"disposición {kind}"


def _split_disposicion_tail(tail: str) -> tuple[str | None, str | None]:
    """Split a disposicion heading's tail into ``(number, title)``.

    *tail* is everything after the kind word, e.g. ``" primera."``,
    ``" única. Derogación normativa."`` or ``"."`` (bare heading). The
    ordinal sits before the first ``.``, the optional title sentence
    after it.
    """
    number_part, _, title_part = tail.partition(".")
    number = number_part.strip() or None
    title = title_part.strip().rstrip(".").strip() or None
    return number, title


def _build_disposicion(
    heading: str,
    kind: str,
    number: str | None,
    title: str | None,
    text: str,
    references: list[Reference],
) -> Disposicion:
    """Construct a :class:`Disposicion` instance from parsed components."""
    return Disposicion(
        heading=heading,
        kind=DisposicionKind(kind),
        number=number,
        title=title,
        text=text,
        references=references,
    )


# ---------------------------------------------------------------------------
# Reference detection
# ---------------------------------------------------------------------------

_LAW_REF_RE = re.compile(
    r"(?:Ley(?:\s+Org[aá]nica)?|Real\s+Decreto(?:-[Ll]ey|\s+Ley)?|"
    r"Decreto\s+Legislativo)\s+\d+/\d{4}",
    re.IGNORECASE,
)

_BOE_REF_RE = re.compile(r"BOE-[A-Z]-\d{4}-\d+")

_ARTICLE_REF_RE = re.compile(
    r"art[ií]culos?\s+\d+(?:\s+(?:y|a|al)\s+\d+)*",
    re.IGNORECASE,
)


# Number of characters of preceding context fed into the classifier.
# 120 covers the typical "se modifica el ... Ley X/YYYY" distance
# without dragging in unrelated sentences from earlier paragraphs.
_CLASSIFY_CONTEXT_CHARS = 120

# Heuristic markers, ordered by precedence: REPEALS wins over MODIFIES
# wins over DEVELOPS. ``cites`` is the default fallback.
_REPEALS_PATTERNS = re.compile(
    r"derog|queda\s+derogad|pierde\s+su\s+vigencia",
    re.IGNORECASE,
)
_MODIFIES_PATTERNS = re.compile(
    r"modifica|se\s+da\s+nueva\s+redacci[oó]n|se\s+sustituye",
    re.IGNORECASE,
)
_DEVELOPS_PATTERNS = re.compile(
    r"desarroll|en\s+aplicaci[oó]n\s+de|en\s+cumplimiento\s+de",
    re.IGNORECASE,
)


def _classify_reference(context: str) -> ReferenceKind:
    """Pick a :class:`ReferenceKind` from the preceding context (#144).

    Precedence is REPEALS → MODIFIES → DEVELOPS → CITES (default). The
    heuristic favours the "stronger" relation when multiple markers
    co-occur, e.g. "se modifica la Ley X, y queda derogada la Ley Y"
    parsed near "Ley Y" should classify as REPEALS.
    """
    if _REPEALS_PATTERNS.search(context):
        return ReferenceKind.REPEALS
    if _MODIFIES_PATTERNS.search(context):
        return ReferenceKind.MODIFIES
    if _DEVELOPS_PATTERNS.search(context):
        return ReferenceKind.DEVELOPS
    return ReferenceKind.CITES


_SENTENCE_BOUNDARIES = ".;\n"

# Matches a bare list-item marker (``a)``, ``1.``, ...) preceded by one to
# three newlines, sitting at the very end of a context window — e.g. the
# "\n\na) " between "las siguientes disposiciones:" and "Ley 30/1992" in a
# derogatoria list. Trimming naively on the last newline would cut the
# marker off from the lead-in sentence that actually carries the "derog"
# keyword, misclassifying the citation as CITES instead of REPEALS (#823).
_TRAILING_LIST_MARKER_RE = re.compile(r"(?:\r?\n[ \t]*){1,3}(?:\d{1,2}|[a-z])[.)][ \t]*$", re.IGNORECASE)


def _context_before(text: str, start: int) -> str:
    """Return the citation's preceding context, sentence-bounded.

    Take up to ``_CLASSIFY_CONTEXT_CHARS`` characters before ``start``,
    then trim to the last sentence boundary (``.``, ``;`` or newline) so
    a marker from the previous sentence doesn't bleed into this
    classification. Example: "Se modifica la Ley 1/1990 en su artículo 3.
    Lo dispuesto en la Ley 2/1995 sigue vigente." — the second citation
    must classify as CITES, not MODIFIES.

    Before trimming, a trailing bare list-item marker (``a)``, ``1.``,
    ...) is stripped along with its leading newline(s) so the lead-in
    sentence of an enumerated list (e.g. "Quedan derogadas expresamente
    las siguientes disposiciones:") stays in the window instead of being
    cut off by the newline right before the marker (#823).
    """
    raw = text[max(0, start - _CLASSIFY_CONTEXT_CHARS) : start]
    marker_match = _TRAILING_LIST_MARKER_RE.search(raw)
    if marker_match:
        raw = raw[: marker_match.start()]
    last_boundary = max(raw.rfind(ch) for ch in _SENTENCE_BOUNDARIES)
    if last_boundary >= 0:
        return raw[last_boundary + 1 :]
    return raw


def extract_references(
    text: str,
    source_article: str | None = None,
) -> list[Reference]:
    """Find all cross-references in a text block.

    Each reference is classified by inspecting the ~120 characters of
    preceding context — see :func:`_classify_reference`.
    """
    refs: list[Reference] = []

    for match in _LAW_REF_RE.finditer(text):
        ref_text = match.group(0)
        kind = _classify_reference(_context_before(text, match.start()))
        refs.append(
            Reference(
                target_id=_resolve_reference_id(ref_text),
                target_text=ref_text,
                source_article=source_article,
                kind=kind,
            )
        )

    for match in _BOE_REF_RE.finditer(text):
        ref_text = match.group(0)
        kind = _classify_reference(_context_before(text, match.start()))
        refs.append(
            Reference(
                target_id=ref_text,
                target_text=ref_text,
                source_article=source_article,
                kind=kind,
            )
        )

    return refs


def _resolve_reference_id(ref_text: str) -> str | None:
    """Attempt to resolve a textual law reference to a BOE identifier.

    Currently returns ``None`` — resolution requires a lookup table that
    will be built once the full index is available.
    """
    return None


# ---------------------------------------------------------------------------
# Top-level entry points
# ---------------------------------------------------------------------------


def parse_law_file(file_path: Path) -> Law:
    """Parse a complete ``.md`` law file into a :class:`Law` model.

    This is the main entry point. It composes all sub-parsers:
    1. Read file
    2. Split frontmatter from body
    3. Parse YAML metadata
    4. Extract the section/heading tree
    5. Extract a flat article list
    6. Collect all cross-references
    7. Assemble the Law model
    """
    try:
        content = file_path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ParserError(str(file_path), "File not found") from exc
    except OSError as exc:
        raise ParserError(str(file_path), f"Cannot read file: {exc}") from exc

    return parse_law_content(content, str(file_path))


def parse_law_content(content: str, file_path: str) -> Law:
    """Parse a law from a string — useful for testing without disk I/O.

    Audit #409: ``parse_frontmatter`` raises ``ParserError`` with
    ``file_path='<unknown>'`` (it has no way to know which file the
    YAML came from). We re-raise here with the caller-provided
    ``file_path`` so the 500 error envelope tells an operator which
    law file failed to parse instead of the opaque placeholder.
    """
    yaml_text, body = split_frontmatter(content)
    try:
        raw_fm = parse_frontmatter(yaml_text)
    except ParserError as exc:
        raise ParserError(file_path, exc.reason) from exc
    metadata = frontmatter_to_metadata(raw_fm)
    sections = extract_heading_tree(body)
    articles = extract_articles(body)
    if not articles:
        # #824: ~38% of the 1,857 zero-article laws use numbered ordinals
        # (``Primero.``, ``Único.``, ...) instead of ``Artículo`` headings.
        articles = extract_ordinal_articles(body)
    disposiciones = extract_disposiciones(body)
    all_references = _collect_all_references(articles, disposiciones)

    return Law(
        metadata=metadata,
        sections=sections,
        articles=articles,
        disposiciones=disposiciones,
        references=all_references,
        raw_text=body,
        file_path=file_path,
    )


def _collect_all_references(articles: list[Article], disposiciones: list[Disposicion]) -> list[Reference]:
    """Flatten references from all articles, then all disposiciones (#823)."""
    refs: list[Reference] = []
    for article in articles:
        refs.extend(article.references)
    for disposicion in disposiciones:
        refs.extend(disposicion.references)
    return refs
