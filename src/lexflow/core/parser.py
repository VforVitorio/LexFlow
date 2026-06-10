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
    Jurisdiction,
    LawRank,
    LawStatus,
    ReferenceKind,
    Scope,
)
from lexflow.core.exceptions import ParserError
from lexflow.core.models import Article, Law, LawMetadata, Reference, Section

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
# `tags`, `categories` and/or `keywords`, with values that may be a list
# or a comma-separated string. We fold them all into one normalised,
# de-duplicated, order-preserving list of kebab-case ASCII slugs so the
# `/api/v1/tags` vocabulary is consistent regardless of source spelling.

_TAG_SOURCE_KEYS = ("tags", "categories", "keywords")
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
) -> list[Section]:
    """Recursively build sections for headings at *target_level* depth.

    *target_level* of 0 means "find the minimum level and use that".
    """
    if end_idx is None:
        end_idx = len(matches)

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

        # Content between this heading and the next at same level
        content_start = subset[i][2]
        content_end = subset[j][2] if j < len(subset) else len(body)
        section_body = body[content_start:content_end]

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
        )

        # Extract articles from this section's direct content
        articles = extract_articles(section_body)

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
_ARTICLE_RE = re.compile(
    r"^(?:#{1,6}\s+)?Art[ií]culo\s+(.+?)\.?\s*$",
    re.MULTILINE | re.IGNORECASE,
)


def extract_articles(body: str) -> list[Article]:
    """Extract all articles from a Markdown body.

    Finds ``Articulo N.`` patterns and captures text until the next
    article heading or section heading.
    """
    matches = list(_ARTICLE_RE.finditer(body))
    if not matches:
        return []

    articles: list[Article] = []
    for idx, match in enumerate(matches):
        number = match.group(1).strip()
        text_start = match.end()
        text_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        raw_text = _extract_article_text(body[text_start:text_end])
        references = extract_references(raw_text, source_article=number)
        articles.append(_build_article(number, raw_text, references))

    return articles


# Audit #409 perf: ``_extract_article_text`` runs per article body and
# compares each line against two patterns. Hoisting the regexes to
# module scope avoids 2-5 million ``re.compile`` calls during a cold
# parse of the 12 k-law corpus.
_SECTION_BREAK_RE = re.compile(r"^#{1,4}\s+")
_INLINE_ARTICLE_HEADING_RE = re.compile(r"^#{1,6}\s+Art[ií]culo", re.IGNORECASE)


def _extract_article_text(raw: str) -> str:
    """Clean raw text between two article headings.

    Strips leading/trailing whitespace and stops at the next non-article
    heading (``##``, ``###``, ``####`` without 'Articulo').
    """
    lines: list[str] = []
    for line in raw.split("\n"):
        # Stop at the next section heading (but not an article heading)
        if _SECTION_BREAK_RE.match(line) and not _INLINE_ARTICLE_HEADING_RE.match(line):
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _build_article(number: str, text: str, references: list[Reference]) -> Article:
    """Construct an :class:`Article` instance from parsed components."""
    return Article(
        number=number,
        title=None,
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


def _context_before(text: str, start: int) -> str:
    """Return the citation's preceding context, sentence-bounded.

    Take up to ``_CLASSIFY_CONTEXT_CHARS`` characters before ``start``,
    then trim to the last sentence boundary (``.``, ``;`` or newline) so
    a marker from the previous sentence doesn't bleed into this
    classification. Example: "Se modifica la Ley 1/1990 en su artículo 3.
    Lo dispuesto en la Ley 2/1995 sigue vigente." — the second citation
    must classify as CITES, not MODIFIES.
    """
    raw = text[max(0, start - _CLASSIFY_CONTEXT_CHARS) : start]
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
    all_references = _collect_all_references(articles)

    return Law(
        metadata=metadata,
        sections=sections,
        articles=articles,
        references=all_references,
        raw_text=body,
        file_path=file_path,
    )


def _collect_all_references(articles: list[Article]) -> list[Reference]:
    """Flatten references from all articles into a single list."""
    refs: list[Reference] = []
    for article in articles:
        refs.extend(article.references)
    return refs
