"""Tests for the acronym-to-title expansion used by law search (#671, gap A)."""

from __future__ import annotations

from lexflow.core.law_aliases import LAW_ALIASES, expand_alias


class TestExpandAlias:
    def test_known_acronym_expands(self) -> None:
        assert expand_alias("LOPD") == "protección de datos personales"

    def test_expansion_is_case_insensitive(self) -> None:
        assert expand_alias("lopd") == expand_alias("LOPD")
        assert expand_alias("LoPd") == expand_alias("LOPD")

    def test_unknown_token_returns_none(self) -> None:
        assert expand_alias("LOPDD") is None
        assert expand_alias("NOTALAW") is None

    def test_near_miss_does_not_match(self) -> None:
        # Exact-match only: a phrase containing the acronym must not hijack it.
        assert expand_alias("el lopd de 2018") is None

    def test_surrounding_whitespace_is_trimmed(self) -> None:
        assert expand_alias("  LGT  ") == expand_alias("LGT")

    def test_internal_whitespace_is_collapsed(self) -> None:
        assert expand_alias("LO   1/2004") == expand_alias("LO 1/2004")

    def test_empty_query_returns_none(self) -> None:
        assert expand_alias("") is None
        assert expand_alias("   ") is None

    def test_every_alias_key_expands_to_itself(self) -> None:
        for acronym, expansion in LAW_ALIASES.items():
            assert expand_alias(acronym) == expansion
            assert expand_alias(acronym.lower()) == expansion


class TestAliasMapIntegrity:
    def test_no_empty_keys_or_values(self) -> None:
        for acronym, expansion in LAW_ALIASES.items():
            assert acronym.strip() != ""
            assert expansion.strip() != ""

    def test_every_expansion_is_lowercase(self) -> None:
        for expansion in LAW_ALIASES.values():
            assert expansion == expansion.lower()

    def test_every_key_is_uppercase(self) -> None:
        for acronym in LAW_ALIASES:
            assert acronym == acronym.upper()

    def test_map_has_a_meaningful_number_of_entries(self) -> None:
        # Sanity check on the seed size the task asked for (~30-40 curated
        # acronyms) -- guards against an accidental near-empty map.
        assert len(LAW_ALIASES) >= 25
