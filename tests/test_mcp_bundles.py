"""Tests for ``.mcpb`` bundle install (#123).

Bundles are zip files with ``manifest.json`` + the actual MCP server
content. The tests build minimal bundles on the fly so we cover the
contract without depending on any specific real-world bundle.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.mcp_servers import bundle as bundle_mod
from lexflow.mcp_servers.bundle import BundleError, install_bundle

# ─── Bundle factory ─────────────────────────────────────────────────────


def _build_bundle(
    manifest: dict[str, object],
    extra_files: dict[str, bytes] | None = None,
) -> bytes:
    """Return the bytes of a .mcpb zip carrying ``manifest`` + ``extra_files``."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
        for name, payload in (extra_files or {}).items():
            zf.writestr(name, payload)
    return buf.getvalue()


def _write_bundle(tmp_path: Path, name: str, manifest: dict[str, object]) -> Path:
    path = tmp_path / name
    path.write_bytes(_build_bundle(manifest))
    return path


# ─── install_bundle (module) ────────────────────────────────────────────


class TestInstallBundleHappyPath:
    def test_extracts_and_returns_entry(self, tmp_path: Path) -> None:
        bundle = _build_bundle(
            {
                "name": "fetch-pro",
                "version": "1.0.0",
                "description": "Fetch URLs.",
                "command": {"command": "node", "args": ["server.js"]},
            },
            extra_files={"server.js": b"console.log('hi')\n"},
        )
        bundle_path = tmp_path / "fetch-pro.mcpb"
        bundle_path.write_bytes(bundle)

        entry = install_bundle(bundle_path, tmp_path)
        assert entry.name == "fetch-pro"
        assert entry.description == "Fetch URLs."
        # Pathless commands (``node``, ``npx`` …) stay verbatim.
        assert entry.command.command == "node"
        assert entry.command.args == ["server.js"]
        # Bundle dir exists with the payload extracted.
        installed = tmp_path / "mcp-bundles" / "fetch-pro" / "server.js"
        assert installed.exists()

    def test_resolves_relative_command_against_install_dir(self, tmp_path: Path) -> None:
        bundle = _build_bundle(
            {
                "name": "with-binary",
                "version": "1.0.0",
                "command": {"command": "./bin/run", "args": []},
            },
            extra_files={"bin/run": b"#!/bin/sh\necho hi\n"},
        )
        bundle_path = tmp_path / "with-binary.mcpb"
        bundle_path.write_bytes(bundle)

        entry = install_bundle(bundle_path, tmp_path)
        expected = (tmp_path / "mcp-bundles" / "with-binary" / "./bin/run").resolve()
        assert entry.command.command == str(expected)


class TestInstallBundleFailures:
    def test_missing_file(self, tmp_path: Path) -> None:
        with pytest.raises(BundleError, match="not found"):
            install_bundle(tmp_path / "nope.mcpb", tmp_path)

    def test_not_a_zip(self, tmp_path: Path) -> None:
        path = tmp_path / "bad.mcpb"
        path.write_bytes(b"this is plainly not a zip")
        with pytest.raises(BundleError, match="zip"):
            install_bundle(path, tmp_path)

    def test_missing_manifest(self, tmp_path: Path) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("readme.txt", b"no manifest here")
        path = tmp_path / "no-manifest.mcpb"
        path.write_bytes(buf.getvalue())
        with pytest.raises(BundleError, match="manifest"):
            install_bundle(path, tmp_path)

    def test_manifest_missing_required_field(self, tmp_path: Path) -> None:
        path = _write_bundle(tmp_path, "bad.mcpb", {"name": "no-version", "command": {"command": "x"}})
        with pytest.raises(BundleError, match="validation"):
            install_bundle(path, tmp_path)

    def test_manifest_not_json(self, tmp_path: Path) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("manifest.json", b"\xff\xfenot-json")
        path = tmp_path / "bad-manifest.mcpb"
        path.write_bytes(buf.getvalue())
        with pytest.raises(BundleError, match=r"JSON|UTF-8"):
            install_bundle(path, tmp_path)

    def test_zip_slip_member_is_rejected(self, tmp_path: Path) -> None:
        buf = io.BytesIO()
        manifest = {"name": "slip", "version": "1.0.0", "command": {"command": "x"}}
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("../escape.txt", b"GOTCHA")
        path = tmp_path / "slip.mcpb"
        path.write_bytes(buf.getvalue())
        with pytest.raises(BundleError, match="escapes"):
            install_bundle(path, tmp_path)

    def test_oversize_member_is_rejected(self, tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
        # Shrink the cap so we don't need a real 25 MB payload.
        monkeypatch.setattr(bundle_mod, "_MAX_MEMBER_BYTES", 128)
        bundle = _build_bundle(
            {"name": "big", "version": "1.0.0", "command": {"command": "x"}},
            extra_files={"huge.bin": b"x" * 256},
        )
        path = tmp_path / "big.mcpb"
        path.write_bytes(bundle)
        with pytest.raises(BundleError, match="exceeds"):
            install_bundle(path, tmp_path)

    def test_total_oversize_is_rejected(self, tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setattr(bundle_mod, "_MAX_UNCOMPRESSED_BYTES", 256)
        bundle = _build_bundle(
            {"name": "big-total", "version": "1.0.0", "command": {"command": "x"}},
            extra_files={"a.bin": b"a" * 200, "b.bin": b"b" * 200},
        )
        path = tmp_path / "big-total.mcpb"
        path.write_bytes(bundle)
        with pytest.raises(BundleError, match="exceeds"):
            install_bundle(path, tmp_path)


# ─── HTTP endpoint ──────────────────────────────────────────────────────


@pytest.fixture()
def _isolated_config_dir(tmp_path: Path, monkeypatch: MonkeyPatch) -> Path:
    """Point ``LEXFLOW_CONFIG_DIR`` at a clean per-test directory."""
    monkeypatch.setenv("LEXFLOW_CONFIG_DIR", str(tmp_path))
    from lexflow.utils.config import get_settings

    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


class TestInstallBundleEndpoint:
    def test_uploads_valid_bundle(
        self,
        client: TestClient,
        _isolated_config_dir: Path,
    ) -> None:
        bundle_bytes = _build_bundle(
            {
                "name": "uploaded-server",
                "version": "1.2.3",
                "description": "Uploaded via API.",
                "command": {"command": "npx", "args": ["@vendor/mcp-server"]},
            }
        )
        response = client.post(
            "/api/v1/mcp/bundles",
            files={"file": ("uploaded.mcpb", bundle_bytes, "application/zip")},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "uploaded-server"
        assert body["kind"] == "user"
        assert body["enabled"] is True

    def test_rejects_corrupt_zip(self, client: TestClient, _isolated_config_dir: Path) -> None:
        response = client.post(
            "/api/v1/mcp/bundles",
            files={"file": ("bad.mcpb", b"garbage", "application/zip")},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_bundle"

    def test_name_collision_with_existing_user_entry(
        self,
        client: TestClient,
        _isolated_config_dir: Path,
    ) -> None:
        manifest = {
            "name": "duplicate",
            "version": "1.0.0",
            "command": {"command": "echo"},
        }
        first = client.post(
            "/api/v1/mcp/bundles",
            files={"file": ("a.mcpb", _build_bundle(manifest), "application/zip")},
        )
        assert first.status_code == 201
        second = client.post(
            "/api/v1/mcp/bundles",
            files={"file": ("b.mcpb", _build_bundle(manifest), "application/zip")},
        )
        assert second.status_code == 409
        assert second.json()["detail"]["code"] == "name_taken"
