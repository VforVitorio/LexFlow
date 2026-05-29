"""Tests for the canonical JSON + hash chain helpers (#124 Phase 1).

Asserts byte-for-byte compatibility with the Agent_Sudo draft spec at
https://github.com/Kisyntra/Agent_Sudo/blob/main/spec/canonical_hash_chain.md
(v0.4.0-rc13). The reference outputs are taken directly from Ram's
``test_spec_helpers.py`` so a drift in our implementation surfaces here
before it reaches the cross-system interop test.
"""

from __future__ import annotations

import hashlib
import json

from lexflow.chat.audit.canonical import (
    GENESIS_PREVIOUS_HASH,
    canonicalize_record,
    compute_entry_hash,
    verify_chain,
)


class TestCanonicalizeRecord:
    def test_sorts_keys_recursively_at_every_nesting_level(self) -> None:
        record = {"z": 1, "c": [{"x": 4, "d": 5}, 6], "a": {"y": 2, "b": 3}}
        canonical = canonicalize_record(record)
        # Reference output asserted by Ram's spec_helpers tests.
        assert canonical == b'{"a":{"b":3,"y":2},"c":[{"d":5,"x":4},6],"z":1}'

    def test_excludes_entry_hash_key_from_serialisation(self) -> None:
        record = {"a": 1, "entry_hash": "deadbeef"}
        assert canonicalize_record(record) == b'{"a":1}'

    def test_preserves_utf8_bytes_for_non_ascii(self) -> None:
        # Spec: "encoded as a raw, standard UTF-8 byte stream" — non-ASCII
        # characters travel as their UTF-8 bytes, not as `\\uXXXX` escapes.
        record = {"reason": "permitido"}
        assert canonicalize_record(record) == b'{"reason":"permitido"}'

    def test_no_whitespace_around_separators(self) -> None:
        record = {"a": [1, 2], "b": {"c": 3}}
        canonical = canonicalize_record(record).decode("utf-8")
        # If any commas or colons had whitespace, the substring would change.
        assert canonical == '{"a":[1,2],"b":{"c":3}}'

    def test_returns_bytes_not_str(self) -> None:
        assert isinstance(canonicalize_record({"a": 1}), bytes)

    def test_identical_inputs_produce_identical_outputs(self) -> None:
        # Determinism guard — a regression would break the hash chain.
        record = {"x": 1, "y": [1, {"z": 2}]}
        assert canonicalize_record(record) == canonicalize_record(record)


class TestComputeEntryHash:
    def test_returns_64_character_lowercase_hex(self) -> None:
        entry = compute_entry_hash(GENESIS_PREVIOUS_HASH, {"a": 1})
        assert len(entry) == 64
        assert entry == entry.lower()
        # Must be valid hex.
        int(entry, 16)

    def test_matches_manual_sha256_over_prev_plus_canonical(self) -> None:
        # The exact algorithm: SHA-256(prev_hash.encode() + canonical_bytes).
        record = {"x": 1}
        canonical = canonicalize_record(record)
        expected = hashlib.sha256(GENESIS_PREVIOUS_HASH.encode("utf-8") + canonical).hexdigest()
        assert compute_entry_hash(GENESIS_PREVIOUS_HASH, record) == expected

    def test_different_previous_hashes_produce_different_entries(self) -> None:
        a = compute_entry_hash(GENESIS_PREVIOUS_HASH, {"x": 1})
        b = compute_entry_hash("f" * 64, {"x": 1})
        assert a != b


class TestVerifyChain:
    def _record(self, prev: str, payload: dict) -> dict:
        rec = {"previous_hash": prev, **payload}
        rec["entry_hash"] = compute_entry_hash(prev, rec)
        return rec

    def test_valid_three_record_chain_verifies(self) -> None:
        r1 = self._record(GENESIS_PREVIOUS_HASH, {"a": 1})
        r2 = self._record(r1["entry_hash"], {"a": 2})
        r3 = self._record(r2["entry_hash"], {"a": 3})
        result = verify_chain([r1, r2, r3])
        assert result.success is True
        assert bool(result) is True

    def test_broken_previous_hash_link_is_caught_at_correct_line(self) -> None:
        r1 = self._record(GENESIS_PREVIOUS_HASH, {"a": 1})
        # Forged: claims to follow r1 but uses a wrong previous_hash.
        r2 = self._record("f" * 64, {"a": 2})
        result = verify_chain([r1, r2])
        assert result.success is False
        assert result.line_number == 2
        assert result.reason == "previous_hash mismatch"

    def test_tampered_payload_breaks_entry_hash(self) -> None:
        r1 = self._record(GENESIS_PREVIOUS_HASH, {"a": 1})
        r1["a"] = 999  # Tamper after the hash was computed.
        result = verify_chain([r1])
        assert result.success is False
        assert result.line_number == 1
        assert result.reason == "entry_hash mismatch"

    def test_extension_fields_participate_in_hash(self) -> None:
        """Regression guard for Ram's design choice (#124 thread): unknown
        keys are included in the canonical bytes, so adding or modifying a
        ``lexflow_*`` field after hashing must invalidate the chain."""
        r1 = self._record(GENESIS_PREVIOUS_HASH, {"a": 1, "lexflow_session_id": "abc"})
        r1["lexflow_session_id"] = "tampered"
        result = verify_chain([r1])
        assert result.success is False

    def test_empty_iterable_verifies_trivially(self) -> None:
        assert verify_chain([]).success is True

    def test_json_roundtrip_of_chain(self) -> None:
        """Records survive JSON ↔ dict round-trip without breaking the chain
        — the on-disk form is JSON, so this guards against any int/float
        coercion surprises in :mod:`json`."""
        r1 = self._record(GENESIS_PREVIOUS_HASH, {"n": 42})
        r2 = self._record(r1["entry_hash"], {"n": 43})
        roundtripped = [json.loads(json.dumps(r1)), json.loads(json.dumps(r2))]
        assert verify_chain(roundtripped).success is True
