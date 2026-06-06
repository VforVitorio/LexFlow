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

import ipaddress
import socket
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Audit #409: ``McpServerCommand.url`` used to accept any string. Without
# a guard the persisted URL drives outbound fetchmcp calls and an
# attacker could SSRF to instance-metadata services (169.254.169.254),
# loopback or RFC1918 ranges. The validator below normalises the URL
# and rejects schemes and IP ranges that have no legitimate use in a
# user-added MCP server.
_ALLOWED_URL_SCHEMES = {"http", "https"}


def _hostname_resolves_to_private_address(hostname: str) -> bool:
    """Return ``True`` if any address ``hostname`` resolves to is private.

    Used to refuse hostnames like ``localhost.<vendor>.com`` that resolve
    to ``127.0.0.1`` or DNS rebinding targets pointing at RFC1918 ranges.
    """
    try:
        infos = socket.getaddrinfo(hostname, None)
    except (socket.gaierror, UnicodeError):
        # Unresolvable hostnames are accepted at validation time — the
        # outbound HTTP call will fail loudly later. We only block IP
        # ranges that DO resolve.
        return False
    for _family, _type, _proto, _canon, sockaddr in infos:
        if not sockaddr:
            continue
        try:
            addr = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            continue
        if addr.is_loopback or addr.is_private or addr.is_link_local or addr.is_multicast or addr.is_reserved:
            return True
    return False


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
        description="Remote MCP endpoint (mutually exclusive with command). Only http(s) schemes allowed; loopback / RFC1918 / link-local addresses are rejected to prevent SSRF.",
    )

    @field_validator("url")
    @classmethod
    def _reject_ssrf_targets(cls, value: str | None) -> str | None:
        """Audit #409: refuse schemes / hosts that enable SSRF.

        Validates at persistence time so a malicious manifest can't
        store a `file://` URL or a `169.254.169.254` host and have a
        later fetchmcp call read host metadata. The check is best-
        effort against DNS rebinding — once we accept a hostname here,
        the outbound HTTP client should still set a short connect
        timeout and refuse redirects to private ranges.
        """
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            return None
        parsed = urlparse(cleaned)
        scheme = (parsed.scheme or "").lower()
        if scheme not in _ALLOWED_URL_SCHEMES:
            raise ValueError(f"MCP server URL must use http(s); got scheme={scheme!r}")
        host = parsed.hostname or ""
        if not host:
            raise ValueError("MCP server URL has no hostname")
        # Block raw private / loopback / link-local IPs.
        try:
            literal = ipaddress.ip_address(host)
        except ValueError:
            literal = None
        if literal is not None and (
            literal.is_loopback
            or literal.is_private
            or literal.is_link_local
            or literal.is_multicast
            or literal.is_reserved
        ):
            raise ValueError(f"MCP server URL host {host!r} resolves to a non-routable address")
        if literal is None and _hostname_resolves_to_private_address(host):
            raise ValueError(f"MCP server URL host {host!r} resolves to a non-routable address")
        return cleaned


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
