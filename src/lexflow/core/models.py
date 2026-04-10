"""Pydantic domain models for Spanish legislation."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from lexflow.core.enums import (
    ConsolidationStatus,
    Jurisdiction,
    LawRank,
    LawStatus,
    Scope,
)

# ---------------------------------------------------------------------------
# Cross-references
# ---------------------------------------------------------------------------


class Reference(BaseModel):
    """A cross-reference from one law or article to another."""

    model_config = ConfigDict(frozen=True)

    target_id: str | None = Field(
        None,
        description="BOE identifier of the referenced law, if resolvable.",
    )
    target_text: str = Field(
        ...,
        description="Raw text of the reference as found in the source.",
    )
    source_article: str | None = Field(
        None,
        description="Article number where this reference appears.",
    )


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------


class Article(BaseModel):
    """A single article within a law."""

    model_config = ConfigDict(frozen=True)

    number: str = Field(
        ...,
        description="Article number (e.g. '1', '2 bis').",
    )
    title: str | None = Field(
        None,
        description="Optional article title.",
    )
    text: str = Field(
        ...,
        description="Full text content of the article.",
    )
    references: list[Reference] = Field(
        default_factory=list,
        description="Cross-references found in this article.",
    )

    @field_validator("number")
    @classmethod
    def normalize_number(cls, v: str) -> str:
        """Strip whitespace and any leading 'Articulo' prefix."""
        cleaned = v.strip()
        for prefix in ("Artículo", "Articulo"):
            if cleaned.lower().startswith(prefix.lower()):
                cleaned = cleaned[len(prefix) :].strip()
        return cleaned.rstrip(".")


# ---------------------------------------------------------------------------
# Sections (recursive)
# ---------------------------------------------------------------------------


class Section(BaseModel):
    """A structural section (Titulo, Capitulo, Seccion) within a law.

    Sections nest recursively to model the heading hierarchy.
    """

    model_config = ConfigDict(frozen=True)

    level: int = Field(
        ...,
        ge=1,
        le=5,
        description="Heading depth: 1=document, 2=Titulo, 3=Capitulo, 4=Seccion, 5=Articulo.",
    )
    heading: str = Field(
        ...,
        description="Section heading text.",
    )
    articles: list[Article] = Field(default_factory=list)
    subsections: list[Section] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------


class LawMetadata(BaseModel):
    """Metadata extracted from YAML frontmatter of a legalize-es file."""

    model_config = ConfigDict(frozen=True)

    identifier: str = Field(
        ...,
        description="BOE identifier (e.g. 'BOE-A-1978-31229').",
    )
    title: str = Field(
        ...,
        description="Full official title of the law.",
    )
    rank: LawRank = Field(LawRank.OTRO, description="Hierarchical rank.")
    status: LawStatus = Field(LawStatus.IN_FORCE)
    publication_date: date | None = Field(None)
    enactment_date: date | None = Field(None)
    last_updated: date | None = Field(None)
    source: str | None = Field(None, description="URL to official BOE source.")
    department: str | None = Field(None)
    official_journal: str | None = Field(None)
    journal_issue: str | None = Field(None)
    consolidation_status: ConsolidationStatus = Field(ConsolidationStatus.UNKNOWN)
    scope: Scope = Field(Scope.ESTATAL)
    jurisdiction: Jurisdiction | None = Field(None)
    country: str = Field("es")


# ---------------------------------------------------------------------------
# Full law
# ---------------------------------------------------------------------------


class Law(BaseModel):
    """Complete parsed representation of a law."""

    model_config = ConfigDict(frozen=True)

    metadata: LawMetadata
    sections: list[Section] = Field(default_factory=list)
    articles: list[Article] = Field(
        default_factory=list,
        description="Flat list of all articles for quick access.",
    )
    references: list[Reference] = Field(
        default_factory=list,
        description="All cross-references found in the law.",
    )
    raw_text: str = Field("", description="Full markdown body without frontmatter.")
    file_path: str = Field(..., description="Relative path to the source .md file.")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def article_count(self) -> int:
        """Total number of articles in this law."""
        return len(self.articles)


# ---------------------------------------------------------------------------
# Version history
# ---------------------------------------------------------------------------


class LawVersion(BaseModel):
    """A historical version of a law, derived from git commit history."""

    model_config = ConfigDict(frozen=True)

    commit_hash: str
    date: date
    message: str
    norma: str | None = Field(None, description="Reform norm from git trailer.")
    disposicion: str | None = Field(None, description="Amending disposition identifier.")
    articulos_afectados: list[str] = Field(
        default_factory=list,
        description="List of affected article identifiers.",
    )


class DiffStats(BaseModel):
    """Statistics for a diff between two versions."""

    model_config = ConfigDict(frozen=True)

    additions: int = 0
    deletions: int = 0
    changed_articles: list[str] = Field(default_factory=list)


class LawDiff(BaseModel):
    """Diff between two versions of a law."""

    model_config = ConfigDict(frozen=True)

    law_id: str
    from_commit: str
    to_commit: str
    from_date: date | None = None
    to_date: date | None = None
    diff_text: str = Field(..., description="Unified diff output.")
    stats: DiffStats
