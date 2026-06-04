"""Install ``.mcpb`` desktop-extension bundles (#123).

A ``.mcpb`` file is a zip carrying ``manifest.json`` + the actual MCP
server binary / scripts. Spec:
https://github.com/modelcontextprotocol/mcpb

This module handles the install flow:

1. Open the uploaded ``.mcpb`` (already on disk) as a zip.
2. Read + validate ``manifest.json`` — the required surface is
   ``name``, ``version`` and the launch ``command`` (or ``url``).
3. Extract the rest under
   ``<config_dir>/mcp-bundles/<sanitised-name>/``.
4. Project the manifest into a :class:`UserMcpServerEntry` so the
   existing ``mcp.json`` storage layer + Settings UI pick it up
   without changes.

The endpoint glue (``POST /api/v1/mcp/bundles``) lives in
``api/routers/mcp_servers.py`` — this module is pure logic so it can
be unit-tested without spinning up FastAPI.

--- WHERE TO CHANGE IF X CHANGES ---
* New manifest field            → extend :func:`_manifest_to_entry`.
* Signature verification        → wrap :func:`install_bundle` in a
                                   ``verify_signature_first`` decorator;
                                   spec is dormant pending Anthropic
                                   keys.
* Per-bundle sandboxing         → wrap the resolved command in
                                   :func:`_manifest_to_entry` (e.g.
                                   ``firejail --net=none``).
"""

from __future__ import annotations

import json
import logging
import re
import zipfile
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from lexflow.mcp_servers.schemas import McpServerCommand, UserMcpServerEntry

logger = logging.getLogger(__name__)

# Sub-directory under ``LEXFLOW_CONFIG_DIR`` where bundles unpack.
BUNDLES_DIRNAME = "mcp-bundles"

# Bundle names map 1:1 to filesystem directories — keep the character
# set narrow so a malicious manifest can't path-escape via slashes,
# dotdot, drive letters etc. Mirrors the pattern on UserMcpServerEntry
# but applied BEFORE we ever construct the entry.
_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9._@/-]+$")

# Reject ginormous bundles. Real MCP servers are typically <5 MB; 50 MB
# is enough headroom for ML-heavy ones while keeping a malicious zip
# from filling the user's disk during extraction.
_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024

# Final guard against zip-slip. We additionally normalise paths in
# :func:`_safe_extract` but cap the size of any single member too.
_MAX_MEMBER_BYTES = 25 * 1024 * 1024


class BundleError(ValueError):
    """Raised when a ``.mcpb`` fails validation or extraction."""


class BundleManifest(BaseModel):
    """The subset of ``manifest.json`` LexFlow actually consumes.

    Extra fields are tolerated (spec is evolving); only the four
    required surfaces here are enforced.
    """

    name: str = Field(..., min_length=1, max_length=64)
    version: str = Field(..., min_length=1, max_length=32)
    description: str = ""
    command: McpServerCommand


def install_bundle(bundle_path: Path, config_dir: Path) -> UserMcpServerEntry:
    """Install ``bundle_path`` under ``config_dir`` and return the entry.

    The caller is expected to:
    1. Have already written the upload to ``bundle_path``.
    2. Persist the returned :class:`UserMcpServerEntry` via the
       existing ``mcp.json`` storage (see
       :mod:`lexflow.mcp_servers.config`).

    Raises :class:`BundleError` on any validation / extraction
    failure. The destination directory is left in a consistent state:
    we extract to a temporary dir alongside the target and rename
    only after the manifest validates, so a half-failed install
    doesn't leave a corrupt bundle behind.
    """
    if not bundle_path.is_file():
        raise BundleError(f"Bundle file not found: {bundle_path}")
    try:
        archive = zipfile.ZipFile(bundle_path)
    except zipfile.BadZipFile as exc:
        raise BundleError(f"Not a valid .mcpb (zip) file: {exc}") from exc
    with archive:
        manifest = _read_manifest(archive)
        _validate_total_size(archive)
        bundles_root = config_dir / BUNDLES_DIRNAME
        destination = bundles_root / _sanitise_name(manifest.name)
        _safe_extract(archive, destination)
    return _manifest_to_entry(manifest, destination)


def _read_manifest(archive: zipfile.ZipFile) -> BundleManifest:
    """Locate + parse ``manifest.json`` at the archive root.

    Spec requires ``manifest.json`` exactly — case-sensitive, top
    level. We don't accept nested manifests; the path traversal
    surface is too easy to abuse otherwise.
    """
    try:
        raw = archive.read("manifest.json")
    except KeyError as exc:
        raise BundleError("Bundle is missing manifest.json at the root") from exc
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BundleError(f"manifest.json is not valid UTF-8 JSON: {exc}") from exc
    try:
        return BundleManifest.model_validate(data)
    except ValidationError as exc:
        raise BundleError(f"manifest.json failed validation: {exc}") from exc


def _validate_total_size(archive: zipfile.ZipFile) -> None:
    """Reject bundles whose uncompressed bytes would blow up on disk.

    Also flags any single member over :data:`_MAX_MEMBER_BYTES` so a
    crafted zip can't tank one file at install time.
    """
    total = 0
    for info in archive.infolist():
        if info.file_size > _MAX_MEMBER_BYTES:
            raise BundleError(f"Bundle member {info.filename!r} exceeds {_MAX_MEMBER_BYTES // (1024 * 1024)} MB")
        total += info.file_size
    if total > _MAX_UNCOMPRESSED_BYTES:
        raise BundleError(
            f"Bundle's uncompressed size ({total} bytes) exceeds the {_MAX_UNCOMPRESSED_BYTES // (1024 * 1024)} MB cap"
        )


def _sanitise_name(name: str) -> str:
    """Reject names that wouldn't be a safe filesystem segment.

    Manifest names are already constrained at the Pydantic level; this
    is the defence-in-depth guard before we use it as a path. Slashes
    are allowed in the regex (Claude Desktop's catalogue uses
    ``@vendor/server``) so we explicitly reject path traversal here.
    """
    if not _SAFE_NAME_RE.match(name):
        raise BundleError(f"Bundle name {name!r} contains characters disallowed on disk")
    if ".." in name.split("/"):
        raise BundleError(f"Bundle name {name!r} contains path traversal")
    return name


def _safe_extract(archive: zipfile.ZipFile, destination: Path) -> None:
    """Extract every member into ``destination`` rejecting zip-slip.

    ``ZipFile.extractall`` would walk absolute paths and ``..``
    segments straight through. We resolve each target against the
    destination and verify it stays inside.
    """
    destination.mkdir(parents=True, exist_ok=True)
    destination_resolved = destination.resolve()
    for member in archive.infolist():
        target = (destination / member.filename).resolve()
        try:
            target.relative_to(destination_resolved)
        except ValueError as exc:
            raise BundleError(f"Bundle member {member.filename!r} escapes the destination directory") from exc
        if member.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as src, target.open("wb") as dst:
            dst.write(src.read())


def _manifest_to_entry(manifest: BundleManifest, install_dir: Path) -> UserMcpServerEntry:
    """Project the manifest + install location into a server entry.

    Relative paths in the launch ``command`` are resolved against the
    bundle's install dir so the user doesn't have to know where the
    backend dropped it.
    """
    command = manifest.command
    resolved_command = command.command
    if (
        resolved_command
        and not Path(resolved_command).is_absolute()
        and not _looks_like_pathless_executable(resolved_command)
    ):
        resolved_command = str((install_dir / resolved_command).resolve())
    return UserMcpServerEntry(
        name=manifest.name,
        description=manifest.description,
        command=McpServerCommand(
            command=resolved_command,
            args=list(command.args),
            env=dict(command.env),
            url=command.url,
        ),
        enabled=True,
    )


def _looks_like_pathless_executable(command: str) -> bool:
    """Return True for executables that live on ``$PATH`` (e.g. ``npx``).

    Manifest commands are sometimes plain command names — those should
    NOT be rewritten relative to the install dir. Anything containing
    a path separator is treated as bundle-relative.
    """
    return "/" not in command and "\\" not in command
