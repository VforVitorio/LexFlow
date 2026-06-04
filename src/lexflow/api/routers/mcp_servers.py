"""MCP servers CRUD endpoints for the Settings page (#122).

Surface:
    * ``GET    /api/v1/mcp/servers``       — list (built-in + user).
    * ``POST   /api/v1/mcp/servers``       — add a user server.
    * ``PATCH  /api/v1/mcp/servers/{name}`` — toggle the enabled flag.
    * ``DELETE /api/v1/mcp/servers/{name}`` — remove a user server.

Persistence lives in :mod:`lexflow.mcp_servers.config`; this router
only validates input and resolves name conflicts (a user name that
clashes with a built-in is refused).
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from lexflow.mcp_servers import (
    BUILTIN_SERVERS,
    BuiltinMcpServer,
    McpServerCreateRequest,
    McpServerListResponse,
    McpServerPatchRequest,
    McpServerView,
    UserMcpServerEntry,
    load_user_servers,
    save_user_servers,
)
from lexflow.mcp_servers.bundle import BundleError, install_bundle
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["MCP"])

_BUILTIN_NAMES = {b.name for b in BUILTIN_SERVERS}


def _as_view_builtin(entry: BuiltinMcpServer) -> McpServerView:
    """Project a `BuiltinMcpServer` into the flat wire shape."""
    return McpServerView(
        name=entry.name,
        description=entry.description,
        command=entry.command,
        kind="builtin",
        enabled=True,
        docs_url=entry.docs_url,
    )


def _as_view_user(entry: UserMcpServerEntry) -> McpServerView:
    """Project a `UserMcpServerEntry` into the flat wire shape."""
    return McpServerView(
        name=entry.name,
        description=entry.description,
        command=entry.command,
        kind="user",
        enabled=entry.enabled,
        docs_url=None,
    )


@router.get(
    "/servers",
    response_model=McpServerListResponse,
    summary="List all MCP servers (built-in + user-added).",
)
def list_servers() -> McpServerListResponse:
    """Return the combined catalog, built-ins first."""
    items: list[McpServerView] = [_as_view_builtin(b) for b in BUILTIN_SERVERS]
    items.extend(_as_view_user(u) for u in load_user_servers())
    return McpServerListResponse(items=items)


@router.post(
    "/servers",
    response_model=McpServerView,
    status_code=status.HTTP_201_CREATED,
    summary="Add a user MCP server (Claude Desktop schema).",
)
def create_server(body: McpServerCreateRequest) -> McpServerView:
    """Append *body* to the user list and persist.

    Rejects names that collide with a built-in (409) or with an
    existing user entry (409). Built-in entries are never editable
    via this endpoint — they're a code-defined catalog.
    """
    if body.name in _BUILTIN_NAMES:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "name_reserved",
                "message": f"{body.name!r} is a built-in server name and cannot be overridden.",
            },
        )
    entries = load_user_servers()
    if any(entry.name == body.name for entry in entries):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "name_taken",
                "message": f"A user server named {body.name!r} already exists. Delete it first.",
            },
        )
    new_entry = UserMcpServerEntry(
        name=body.name,
        description=body.description,
        command=body.command,
        enabled=True,
    )
    entries.append(new_entry)
    save_user_servers(entries)
    return _as_view_user(new_entry)


@router.patch(
    "/servers/{name}",
    response_model=McpServerView,
    summary="Toggle the enabled flag on a user MCP server.",
)
def patch_server(name: str, body: McpServerPatchRequest) -> McpServerView:
    """Apply patchable fields to the user entry identified by *name*."""
    if name in _BUILTIN_NAMES:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "builtin_immutable",
                "message": f"{name!r} is a built-in server and cannot be patched.",
            },
        )
    if body.enabled is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_patch", "message": "Provide at least one patchable field."},
        )
    entries = load_user_servers()
    for entry in entries:
        if entry.name == name:
            entry.enabled = body.enabled
            save_user_servers(entries)
            return _as_view_user(entry)
    raise HTTPException(status_code=404, detail=f"MCP server not found: {name}")


@router.delete(
    "/servers/{name}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user MCP server. Idempotent.",
)
def delete_server(name: str) -> None:
    """Remove the user entry identified by *name*. Idempotent.

    Built-in entries cannot be deleted (409). Missing user entries
    return 204 — the same response a successful delete returns, so
    clients retrying lost responses converge cleanly (Sprint 5 api-3
    convention).
    """
    if name in _BUILTIN_NAMES:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "builtin_immutable",
                "message": f"{name!r} is a built-in server and cannot be deleted.",
            },
        )
    entries = load_user_servers()
    remaining = [entry for entry in entries if entry.name != name]
    if len(remaining) != len(entries):
        save_user_servers(remaining)


# Max bundle upload size in bytes. Matches the unzipped cap in
# ``mcp_servers/bundle.py`` so an oversize payload is rejected before
# we even open the zip.
_MAX_BUNDLE_UPLOAD_BYTES = 50 * 1024 * 1024


@router.post(
    "/bundles",
    response_model=McpServerView,
    status_code=status.HTTP_201_CREATED,
    summary="Install a .mcpb bundle (Anthropic Desktop Extensions, #123).",
)
async def install_mcp_bundle(file: UploadFile = File(...)) -> McpServerView:
    """Accept a ``.mcpb`` upload, extract + validate, then persist.

    Wire contract:
      * multipart upload, single ``file`` field.
      * 201 + the new ``McpServerView`` on success.
      * 409 if the manifest's ``name`` clashes with a built-in or an
        existing user entry.
      * 400 with ``{"code": ..., "message": ...}`` for any bundle
        validation failure (bad zip, missing manifest, oversize, …).

    The bundle is staged to a temp file first so a too-big upload
    can be rejected without touching the persistent ``mcp-bundles/``
    tree. Only after validation do we move the contents into place
    and append the entry to ``mcp.json``.
    """
    payload = await file.read()
    if len(payload) > _MAX_BUNDLE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "bundle_too_large",
                "message": f"Bundle exceeds {_MAX_BUNDLE_UPLOAD_BYTES // (1024 * 1024)} MB",
            },
        )
    settings = get_settings()
    with tempfile.NamedTemporaryFile(suffix=".mcpb", delete=False) as staged:
        staged.write(payload)
        staged_path = Path(staged.name)
    try:
        try:
            entry = install_bundle(staged_path, settings.config_dir)
        except BundleError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_bundle", "message": str(exc)},
            ) from exc
    finally:
        # Best-effort cleanup; the install copied the bytes already.
        staged_path.unlink(missing_ok=True)

    if entry.name in _BUILTIN_NAMES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "name_reserved",
                "message": f"{entry.name!r} is a built-in server name and cannot be overridden.",
            },
        )
    entries = load_user_servers()
    if any(existing.name == entry.name for existing in entries):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "name_taken",
                "message": f"A user server named {entry.name!r} already exists. Delete it first.",
            },
        )
    entries.append(entry)
    save_user_servers(entries)
    return _as_view_user(entry)
