"""Tests for the Markdown parser."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest

from lexflow.core.enums import DisposicionKind, LawRank, LawStatus
from lexflow.core.exceptions import ParserError
from lexflow.core.parser import (
    extract_articles,
    extract_disposiciones,
    extract_heading_tree,
    extract_ordinal_articles,
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


class TestSectionText:
    """#825: ``Section.text`` carries a section's own prose (preámbulo,
    section intro, anexo), separate from its nested articles/subsections.
    """

    def test_section_with_no_articles_keeps_full_prose(self) -> None:
        body = dedent("""\
            ### PREAMBULO

            Primer parrafo del preambulo.

            Segundo parrafo.
        """)
        sections = extract_heading_tree(body)
        assert sections[0].heading == "PREAMBULO"
        assert "Primer parrafo del preambulo." in sections[0].text
        assert "Segundo parrafo." in sections[0].text
        assert sections[0].articles == []

    def test_section_text_excludes_heading_line(self) -> None:
        body = dedent("""\
            ### ANEXO. Tabla

            | a | b |
            | --- | --- |
            | 1 | 2 |
        """)
        sections = extract_heading_tree(body)
        assert "ANEXO" not in sections[0].text
        assert "| a | b |" in sections[0].text

    def test_section_intro_before_first_article_is_kept(self) -> None:
        body = dedent("""\
            ## TITULO I. Intro

            Este titulo regula lo siguiente.

            ###### Articulo 1.

            Cuerpo del articulo uno.
        """)
        sections = extract_heading_tree(body)
        assert sections[0].text == "Este titulo regula lo siguiente."
        assert len(sections[0].articles) == 1

    def test_section_with_only_articles_has_empty_text(self) -> None:
        body = dedent("""\
            ## TITULO PRELIMINAR

            ###### Articulo 1.

            Cuerpo uno.

            ###### Articulo 2.

            Cuerpo dos.
        """)
        sections = extract_heading_tree(body)
        assert sections[0].text == ""
        assert len(sections[0].articles) == 2


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

    def test_level6_headings_real_corpus_format(self) -> None:
        """Regression (#561): the real legalize-es corpus puts articles at
        markdown level 6 (``###### Artículo N``, accented, no trailing
        period). The fixture above used level 5, which masked a parser cap
        of ``#{1,5}`` that silently extracted ZERO articles from every real
        law (verified: the live Constitution went 0 → 169 with this fix).
        """
        body = dedent("""\
            ###### Artículo 1

            Texto del primero.

            ###### Artículo 2

            Texto del segundo.
        """)
        articles = extract_articles(body)
        assert len(articles) == 2
        assert articles[0].number == "1"
        assert "Texto del primero" in articles[0].text

    def test_heading_title_split_from_number(self) -> None:
        """Regression (#822): the corpus format ``Artículo 1. Objeto de la
        Ley.`` used to land whole in ``number`` (``"1. Objeto de la Ley"``),
        so ``find_article(law, "1")`` missed and ``/articles/1`` 404'd on
        every titled article. Number and title are now separate groups.
        """
        body = "###### Artículo 1. Objeto de la Ley.\n\nTexto del primero."
        articles = extract_articles(body)
        assert len(articles) == 1
        assert articles[0].number == "1"
        assert articles[0].title == "Objeto de la Ley"
        assert "Texto del primero" in articles[0].text

    def test_heading_title_split_with_bis_qualifier(self) -> None:
        body = "###### Artículo 2 bis. Definiciones.\n\nTexto del bis."
        articles = extract_articles(body)
        assert len(articles) == 1
        assert articles[0].number == "2 bis"
        assert articles[0].title == "Definiciones"

    def test_number_only_heading_keeps_title_none(self) -> None:
        body = dedent("""\
            ###### Artículo 1.

            1. Primer párrafo del cuerpo.

            ###### Artículo 2

            Segundo sin punto.
        """)
        articles = extract_articles(body)
        assert len(articles) == 2
        assert articles[0].number == "1"
        assert articles[0].title is None
        # The title group must never leak onto the body's first line.
        assert "Primer párrafo" in articles[0].text
        assert articles[1].number == "2"
        assert articles[1].title is None

    def test_section_articles_not_duplicated_across_levels(self) -> None:
        """Regression (#570): each article appears once in the section tree.

        A parent section used to re-extract its subsections' articles from
        its (wider) body slice, inflating the nested count far past the real
        total (958 vs 169 for the Constitution). The sum of nested articles
        must equal the flat ``extract_articles`` total.
        """
        body = dedent("""\
            ## TITULO I

            ###### Articulo 1

            Directo del titulo.

            ### CAPITULO I

            ###### Articulo 2

            Dentro del capitulo.

            ###### Articulo 3

            Tambien en el capitulo.
        """)
        tree = extract_heading_tree(body)

        def count(sections: list) -> int:
            return sum(len(s.articles) + count(s.subsections) for s in sections)

        assert count(tree) == len(extract_articles(body)) == 3

    def test_non_heading_mention_is_not_a_boundary(self) -> None:
        """Regression (#824): a body line reading "Artículo N" without a
        heading marker must NOT split a new article — only a genuine
        ``#{1,6} Artículo ...`` heading is a boundary. Real corpus proof:
        BOE-A-2021-21097 has 340 real headings but used to parse to 1,573
        "articles" because every inline mention counted too.
        """
        body = dedent("""\
            ###### Artículo 1. Objeto.

            Lo dispuesto en el Artículo 23.1 de esta Ley se aplicará también
            a los casos previstos en Articulo 4 del reglamento.

            ###### Artículo 2. Ámbito.

            Segundo artículo real.
        """)
        articles = extract_articles(body)
        assert len(articles) == 2
        assert [a.number for a in articles] == ["1", "2"]
        assert "Articulo 23.1" not in [a.number for a in articles]


# ---------------------------------------------------------------------------
# Plural article ranges — placeholder articles (#824)
# ---------------------------------------------------------------------------


class TestExtractArticleRanges:
    def test_range_expands_to_placeholder_articles(self) -> None:
        body = dedent("""\
            ###### Artículos 60 a 62.

            **(Derogados)**

            > Se derogan por la Ley 19/2007, de 11 de julio.

            ###### Artículo 63.

            Texto real del articulo 63.
        """)
        articles = extract_articles(body)
        numbers = [a.number for a in articles]
        assert numbers == ["60", "61", "62", "63"]
        placeholder = next(a for a in articles if a.number == "61")
        assert "(Derogados)" in placeholder.text
        assert "Ley 19/2007" in placeholder.text
        assert placeholder.title is None

    def test_range_does_not_override_explicit_singles(self) -> None:
        """A number that ALSO has its own ``Artículo N`` heading keeps its
        real content — the range placeholder never overwrites it (real
        corpus pattern: Código Civil arts. 325-332).
        """
        body = dedent("""\
            ###### Artículos 325 a 327.

            **(Derogados)**

            ###### Artículo 325.

            Texto propio del articulo 325.

            ###### Artículo 326.

            Texto propio del articulo 326.
        """)
        articles = extract_articles(body)
        numbers = [a.number for a in articles]
        assert numbers.count("325") == 1
        assert numbers.count("326") == 1
        assert "327" in numbers
        article_325 = next(a for a in articles if a.number == "325")
        assert "Texto propio del articulo 325" in article_325.text

    def test_range_placeholder_references_extracted(self) -> None:
        body = "###### Artículos 10 a 11.\n\nDerogados por la Ley 1/2020, de 1 de enero."
        articles = extract_articles(body)
        placeholder = next(a for a in articles if a.number == "10")
        assert any("Ley 1/2020" in r.target_text for r in placeholder.references)


# ---------------------------------------------------------------------------
# Ordinal operative clauses — fallback for article-less norms (#824)
# ---------------------------------------------------------------------------


class TestExtractOrdinalArticles:
    def test_ordinal_only_document(self) -> None:
        body = dedent("""\
            ###### Primero. Objeto y ámbito.

            Texto del primero.

            ###### Segundo. Procedimiento.

            Texto del segundo.

            ###### Único. Publicación y efectos.

            Texto del unico.
        """)
        articles = extract_ordinal_articles(body)
        assert [a.number for a in articles] == ["Primero", "Segundo", "Único"]
        assert articles[0].title == "Objeto y ámbito"
        assert "Texto del primero" in articles[0].text

    def test_accent_and_case_variants_normalise(self) -> None:
        body = dedent("""\
            ###### PRIMERO. Uno.

            Texto uno.

            ###### unico. Dos.

            Texto dos.
        """)
        articles = extract_ordinal_articles(body)
        assert [a.number for a in articles] == ["Primero", "Único"]

    def test_empty_body_returns_no_ordinals(self) -> None:
        assert extract_ordinal_articles("Texto sin ordinales ni articulos.") == []

    def test_bare_ordinal_heading_has_no_title(self) -> None:
        body = "###### Único.\n\nTexto sin titulo."
        articles = extract_ordinal_articles(body)
        assert len(articles) == 1
        assert articles[0].number == "Único"
        assert articles[0].title is None


# ---------------------------------------------------------------------------
# Disposiciones (#823)
# ---------------------------------------------------------------------------


class TestExtractDisposiciones:
    def test_mixed_kinds(self) -> None:
        body = dedent("""\
            ###### Disposición adicional primera.

            Texto adicional primera.

            ###### Disposición transitoria primera.

            Texto transitoria primera.

            ###### Disposición derogatoria única. Derogación normativa.

            Texto derogatoria.

            ###### Disposición final primera. Título competencial.

            Texto final primera.
        """)
        disposiciones = extract_disposiciones(body)
        assert [d.kind for d in disposiciones] == [
            DisposicionKind.ADICIONAL,
            DisposicionKind.TRANSITORIA,
            DisposicionKind.DEROGATORIA,
            DisposicionKind.FINAL,
        ]
        assert disposiciones[0].number == "primera"
        assert "Texto adicional primera" in disposiciones[0].text

    def test_derogatoria_unica_splits_number_and_title(self) -> None:
        body = "###### Disposición derogatoria única. Derogación normativa.\n\nQuedan derogadas..."
        disposiciones = extract_disposiciones(body)
        assert len(disposiciones) == 1
        assert disposiciones[0].kind == DisposicionKind.DEROGATORIA
        assert disposiciones[0].number == "única"
        assert disposiciones[0].title == "Derogación normativa"

    def test_bare_heading_has_no_number_or_title(self) -> None:
        body = "###### Disposición derogatoria.\n\nQueda derogada la Ley 1/1977."
        disposiciones = extract_disposiciones(body)
        assert len(disposiciones) == 1
        assert disposiciones[0].number is None
        assert disposiciones[0].title is None
        assert disposiciones[0].heading == "Disposición derogatoria."

    def test_accented_ordinal(self) -> None:
        body = "###### Disposición transitoria séptima.\n\nTexto."
        disposiciones = extract_disposiciones(body)
        assert disposiciones[0].number == "séptima"

    def test_empty_body_no_disposiciones(self) -> None:
        assert extract_disposiciones("No hay disposiciones aquí") == []

    def test_plural_disposiciones_generales_not_matched(self) -> None:
        """A section titled 'Disposiciones generales' (plural) is not a
        disposicion heading — only the singular ``Disposición <kind>``
        forms are.
        """
        body = "## TÍTULO PRELIMINAR. Disposiciones generales\n\n###### Artículo 1.\n\nTexto."
        assert extract_disposiciones(body) == []

    def test_references_extracted_from_disposicion_body(self) -> None:
        body = (
            "###### Disposición derogatoria única. Derogación normativa.\n\n"
            "Queda derogada la Ley 30/1992, de 26 de noviembre."
        )
        disposiciones = extract_disposiciones(body)
        assert len(disposiciones) == 1
        ref_texts = [r.target_text for r in disposiciones[0].references]
        assert any("Ley 30/1992" in t for t in ref_texts)
        assert disposiciones[0].references[0].source_article == "disposición derogatoria única"


class TestArticleDisposicionBoundary:
    def test_last_article_text_stops_before_disposicion(self) -> None:
        """Regression (#823): a trailing disposición block used to be
        swallowed into the last article's body because disposiciones use
        the same level-6 heading depth as articles.
        """
        body = dedent("""\
            ###### Artículo 133. Participación de los ciudadanos.

            Texto del artículo 133.

            ###### Disposición adicional primera. Especialidades.

            Texto de la disposición adicional.
        """)
        articles = extract_articles(body)
        assert len(articles) == 1
        assert "Texto del artículo 133" in articles[0].text
        assert "disposición adicional" not in articles[0].text.lower()

    def test_disposicion_references_not_attributed_to_last_article(self) -> None:
        """Regression (#823): Ley 39/2015's derogatoria references used to
        be mis-attributed to 'art. 133' because the derogatoria text was
        parsed as part of article 133's body.
        """
        body = dedent("""\
            ###### Artículo 133. Participación de los ciudadanos.

            Texto del artículo 133.

            ###### Disposición derogatoria única. Derogación normativa.

            Queda derogada la Ley 30/1992, de 26 de noviembre.
        """)
        articles = extract_articles(body)
        disposiciones = extract_disposiciones(body)
        assert articles[0].references == []
        assert len(disposiciones[0].references) == 1
        assert disposiciones[0].references[0].source_article == "disposición derogatoria única"

    def test_article_text_stops_at_level5_non_article_heading(self) -> None:
        """Regression (#823): ``_SECTION_BREAK_RE`` used to only match
        heading levels 1-4 (``^#{1,4}\\s+``), so a trailing level-5
        non-article heading (e.g. a stray annex/appendix title) leaked
        into the last article's body instead of stopping it.
        """
        body = dedent("""\
            ###### Artículo 169.

            Texto del artículo 169.

            ##### ANEXO

            Texto del anexo.
        """)
        articles = extract_articles(body)
        assert len(articles) == 1
        assert "Texto del artículo 169" in articles[0].text
        assert "anexo" not in articles[0].text.lower()

    def test_article_text_stops_at_level6_non_article_heading(self) -> None:
        """Regression (#823): same as above but at heading level 6, the
        level disposiciones actually use in the real corpus.
        """
        body = dedent("""\
            ###### Artículo 169.

            Texto del artículo 169.

            ###### ANEXO. Título del anexo.

            Texto del anexo.
        """)
        articles = extract_articles(body)
        assert len(articles) == 1
        assert "Texto del artículo 169" in articles[0].text
        assert "anexo" not in articles[0].text.lower()


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

    def test_falls_back_to_ordinals_when_no_articles(self) -> None:
        """#824: a norm with zero ``Artículo`` headings but ordinal
        operative clauses (``Primero.``, ``Segundo.``, ...) still ends up
        with a non-empty, queryable ``law.articles``.
        """
        content = dedent("""\
            ---
            title: "Instruccion sin articulos"
            identifier: "TEST-2"
            ---
            ###### Primero. Objeto.

            Texto del primero.

            ###### Segundo. Ambito.

            Texto del segundo.
        """)
        law = parse_law_content(content, "test.md")
        assert law.article_count == 2
        assert [a.number for a in law.articles] == ["Primero", "Segundo"]

    def test_does_not_fall_back_when_articles_present(self) -> None:
        """The ordinal fallback must never fire for article-bearing norms,
        even if the body also happens to contain an ordinal-looking
        heading elsewhere.
        """
        content = dedent("""\
            ---
            title: "Test"
            identifier: "TEST-3"
            ---
            ##### Articulo 1.

            Contenido real.

            ##### Primero. No es un articulo.

            Esto no deberia colarse como articulo real.
        """)
        law = parse_law_content(content, "test.md")
        assert [a.number for a in law.articles] == ["1"]
        assert law.file_path == "test.md"
