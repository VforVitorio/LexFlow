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

from fastapi import APIRouter, HTTPException, status

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
