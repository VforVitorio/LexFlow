"""Pydantic models for the MCP-servers Settings page (#122).

Two surface classes the user sees:
    * ``BuiltinMcpServer`` — read-only catalog entry, ships with the app.
    * ``UserMcpServerEntry`` — entry the user added; persisted in
      ``mcp.json``.

The wire representation that the SPA renders is ``McpServerView`` — a
flat shape that hides the read-only / user-added distinction behind a
``kind`` field. The Settings page consumes this and renders the right
controls per row.

--- WHERE TO CHANGE IF SCHEMA MOVES ---
* Claude Desktop's `mcpServers` schema       → :class:`McpServerCommand`.
* Add a field surfaced to the SPA           → extend :class:`McpServerView`
                                              AND regenerate the
                                              ``frontend/src/api/schema.ts``
                                              with ``npm run generate:api``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Name of the built-in lexflow MCP server. Centralised so the wizard,
# Settings page and tests never disagree about its identity.
BUILTIN_LEXFLOW_LEGAL_NAME = "lexflow-legal"


class McpServerCommand(BaseModel):
    """One MCP server launch command — matches the Claude Desktop schema.

    A server can either be launched as a child process (``command`` +
    ``args``) or referenced by URL (``url``); the wire protocol covers
    both styles and we keep both fields so a paste from Claude Desktop's
    ``claude_desktop_config.json`` round-trips losslessly.
    """

    model_config = ConfigDict(extra="forbid")

    command: str | None = Field(
        default=None,
        max_length=512,
        description="Executable to launch (e.g. 'npx', 'uvx', '/usr/local/bin/foo').",
    )
    args: list[str] = Field(
        default_factory=list,
        max_length=64,
        description="Args passed to the command. Each entry capped at 512 chars.",
    )
    env: dict[str, str] = Field(
        default_factory=dict,
        description="Extra env vars passed to the child process.",
    )
    url: str | None = Field(
        default=None,
        max_length=512,
        description="Remote MCP endpoint (mutually exclusive with command).",
    )


class BuiltinMcpServer(BaseModel):
    """One entry of the built-in catalog. Read-only from the SPA."""

    name: str
    description: str
    command: McpServerCommand
    docs_url: str | None = None


class UserMcpServerEntry(BaseModel):
    """One entry persisted in ``<config_dir>/mcp.json``.

    Distinct from ``BuiltinMcpServer`` so we can attach mutable state —
    today just ``enabled`` — without polluting the read-only catalog.
    """

    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._@/-]+$")
    description: str = ""
    command: McpServerCommand
    enabled: bool = True


class McpServerView(BaseModel):
    """Flat shape returned by ``GET /api/v1/mcp/servers``.

    ``kind`` is the discriminator the SPA branches on. Built-in rows
    carry ``enabled: true`` purely for symmetry — the SPA refuses to
    flip them locally (the field is informational).
    """

    name: str
    description: str
    command: McpServerCommand
    kind: Literal["builtin", "user"]
    enabled: bool
    docs_url: str | None = None


class McpServerListResponse(BaseModel):
    """Wrapper for ``GET /api/v1/mcp/servers`` (Sprint 6 api-6 convention).

    Wrapped instead of returning a bare list so we can grow metadata
    (counts, schema version, last-modified) without breaking clients.
    """

    items: list[McpServerView]


class McpServerCreateRequest(BaseModel):
    """Body for ``POST /api/v1/mcp/servers`` — adds a user entry.

    Reuses the user-entry shape; the server-side handler refuses names
    that collide with built-in entries.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._@/-]+$")
    description: str = ""
    command: McpServerCommand


class McpServerPatchRequest(BaseModel):
    """Body for ``PATCH /api/v1/mcp/servers/{name}``.

    Only ``enabled`` is patchable today; renaming a server is a delete +
    add because the name is the key.
    """

    model_config = ConfigDict(extra="forbid")

    enabled: bool | None = None
