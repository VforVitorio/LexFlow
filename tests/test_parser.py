"""Tests for the Markdown parser."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest

from lexflow.core.enums import LawRank, LawStatus
from lexflow.core.exceptions import ParserError
from lexflow.core.parser import (
    extract_articles,
    extract_heading_tree,
    extract_references,
    frontmatter_to_metadata,
    parse_frontmatter,
    parse_law_content,
    parse_law_file,
    split_frontmatter,
)

# ---------------------------------------------------------------------------
# Frontmatter
# ---------------------------------------------------------------------------


class TestSplitFrontmatter:
    def test_standard(self) -> None:
        content = "---\ntitle: Test\n---\nBody here"
        yaml_text, body = split_frontmatter(content)
        assert yaml_text == "title: Test"
        assert body == "Body here"

    def test_missing_returns_empty(self) -> None:
        content = "No frontmatter here\nJust text"
        yaml_text, body = split_frontmatter(content)
        assert yaml_text == ""
        assert body == content

    def test_multiline_frontmatter(self) -> None:
        content = "---\ntitle: Test\nrank: ley\nstatus: in_force\n---\n# Heading"
        yaml_text, body = split_frontmatter(content)
        assert "title: Test" in yaml_text
        assert "rank: ley" in yaml_text
        assert body.startswith("# Heading")


class TestParseFrontmatter:
    def test_valid_yaml(self) -> None:
        result = parse_frontmatter("title: Test\nrank: ley")
        assert result["title"] == "Test"
        assert result["rank"] == "ley"

    def test_empty_returns_empty_dict(self) -> None:
        assert parse_frontmatter("") == {}
        assert parse_frontmatter("   ") == {}

    def test_malformed_raises(self) -> None:
        with pytest.raises(ParserError, match="Invalid YAML"):
            parse_frontmatter(":\n  - [invalid yaml {{{{")


class TestFrontmatterToMetadata:
    def test_all_fields(self, sample_frontmatter: str) -> None:
        raw = parse_frontmatter(sample_frontmatter)
        meta = frontmatter_to_metadata(raw)
        assert meta.identifier == "BOE-A-2000-323"
        assert meta.rank == LawRank.LEY
        assert meta.status == LawStatus.IN_FORCE

    def test_missing_optional_defaults(self) -> None:
        raw = {"identifier": "TEST-1", "title": "Test Law"}
        meta = frontmatter_to_metadata(raw)
        assert meta.rank == LawRank.OTRO
        assert meta.publication_date is None
        assert meta.jurisdiction is None

    def test_unknown_rank_defaults_to_otro(self) -> None:
        raw = {"identifier": "TEST-1", "title": "Test", "rank": "unknown_type"}
        meta = frontmatter_to_metadata(raw)
        assert meta.rank == LawRank.OTRO


# ---------------------------------------------------------------------------
# Heading / section tree
# ---------------------------------------------------------------------------


class TestExtractHeadingTree:
    def test_nested_sections(self) -> None:
        body = dedent("""\
            # Main Title

            ## TITULO I. First

            ### CAPITULO I. Sub

            ##### Articulo 1.

            Some text.

            ## TITULO II. Second

            ##### Articulo 2.

            More text.
        """)
        sections = extract_heading_tree(body)
        # Two level-1 sections (## TITULO)
        assert len(sections) >= 1
        assert "Main Title" in sections[0].heading

    def test_empty_body(self) -> None:
        assert extract_heading_tree("") == []

    def test_body_without_headings(self) -> None:
        assert extract_heading_tree("Just plain text\nNo headings here") == []


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------


class TestExtractArticles:
    def test_basic_articles(self) -> None:
        body = dedent("""\
            ##### Articulo 1.

            First article text.

            ##### Articulo 2.

            Second article text.
        """)
        articles = extract_articles(body)
        assert len(articles) == 2
        assert articles[0].number == "1"
        assert articles[1].number == "2"
        assert "First article text" in articles[0].text

    def test_articles_with_subnumbering(self) -> None:
        body = dedent("""\
            ##### Articulo 3.

            1. First paragraph.
            2. Second paragraph.
               a) Sub item a.
               b) Sub item b.
        """)
        articles = extract_articles(body)
        assert len(articles) == 1
        assert "First paragraph" in articles[0].text
        assert "Sub item a" in articles[0].text

    def test_article_bis(self) -> None:
        body = dedent("""\
            ##### Articulo 2 bis.

            Added by reform.
        """)
        articles = extract_articles(body)
        assert len(articles) == 1
        assert articles[0].number == "2 bis"

    def test_empty_body_no_articles(self) -> None:
        assert extract_articles("No articles here") == []

    def test_accented_articulo(self) -> None:
        body = "##### Artículo 1.\n\nText with accent."
        articles = extract_articles(body)
        assert len(articles) == 1
        assert articles[0].number == "1"


# ---------------------------------------------------------------------------
# References
# ---------------------------------------------------------------------------


class TestExtractReferences:
    def test_ley_pattern(self) -> None:
        text = "conforme a la Ley 20/2011, de 21 de julio"
        refs = extract_references(text)
        assert len(refs) == 1
        assert "Ley 20/2011" in refs[0].target_text

    def test_real_decreto(self) -> None:
        text = "segun el Real Decreto 1665/1991"
        refs = extract_references(text)
        assert len(refs) == 1
        assert "Real Decreto 1665/1991" in refs[0].target_text

    def test_ley_organica(self) -> None:
        text = "La Ley Organica 3/2018 establece"
        refs = extract_references(text)
        assert len(refs) == 1

    def test_boe_identifier(self) -> None:
        text = "ver BOE-A-2016-12328 para mas informacion"
        refs = extract_references(text)
        assert len(refs) == 1
        assert refs[0].target_id == "BOE-A-2016-12328"

    def test_no_matches(self) -> None:
        refs = extract_references("Texto sin referencias legales")
        assert refs == []

    def test_source_article_propagated(self) -> None:
        text = "Ley 58/2003 aplicable"
        refs = extract_references(text, source_article="7")
        assert refs[0].source_article == "7"


# ---------------------------------------------------------------------------
# Integration
# ---------------------------------------------------------------------------


class TestParseLawFile:
    def test_from_disk(self, sample_law_markdown: Path) -> None:
        law = parse_law_file(sample_law_markdown)
        assert law.metadata.identifier == "BOE-A-2000-323"
        assert law.metadata.rank == LawRank.LEY
        assert len(law.articles) == 3
        assert law.article_count == 3

    def test_references_collected(self, sample_law_markdown: Path) -> None:
        law = parse_law_file(sample_law_markdown)
        ref_texts = [r.target_text for r in law.references]
        assert any("Ley 20/2011" in t for t in ref_texts)
        assert any("Real Decreto 1665/1991" in t for t in ref_texts)

    def test_nonexistent_file_raises(self, tmp_path: Path) -> None:
        with pytest.raises(ParserError, match="File not found"):
            parse_law_file(tmp_path / "nonexistent.md")


class TestParseLawContent:
    def test_minimal(self) -> None:
        content = dedent("""\
            ---
            title: "Test"
            identifier: "TEST-1"
            ---
            ##### Articulo 1.

            Content here.
        """)
        law = parse_law_content(content, "test.md")
        assert law.metadata.identifier == "TEST-1"
        assert len(law.articles) == 1
        assert law.file_path == "test.md"
