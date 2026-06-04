"""Internal MCP client: consume external MCP servers from inside LexFlow (#121).

LexFlow already ships an MCP **server** (``chat/mcp_server.py``)
exposing legal tools. This module is the inverse: a **client** that
attaches to user-configured external MCP servers (fetch, filesystem,
mcp-pandoc, boe-mcp, etc.) and surfaces their tools to the agentic
loop in :mod:`lexflow.chat.streaming`.

Architecture
------------

* Each enabled server in ``<config_dir>/mcp.json`` (see
  :mod:`lexflow.mcp_servers`) maps to one ``fastmcp.Client`` instance.
* :class:`MCPMultiClient` is a thin fan-out: ``list_tools()`` merges
  tool catalogues across every connected server, tagging each tool
  with the originating ``server_name``.
* Connections are **lazy** — the client is constructed and connected
  only the first time a tool listing or dispatch hits the server, so
  startup stays fast even when half a dozen servers are configured.

Process boundary
----------------

Built-in MCP tools (``search_law`` etc. defined in
:mod:`lexflow.chat.mcp_server`) bypass this whole layer — they live
in-process and are dispatched directly. External MCP servers run as
**subprocesses** (stdio transport); spinning them up + tearing them
down is delegated to ``fastmcp.Client``.

--- WHERE TO CHANGE IF X CHANGES ---
* Replace ``fastmcp.Client`` with another impl  → swap the call site
                                                  inside
                                                  :meth:`_connect_to`.
* Add caching across requests                   → store the connected
                                                  client on
                                                  ``self._clients``
                                                  (already wired) and
                                                  add an explicit
                                                  shutdown hook.
* Add subprocess sandboxing                     → wrap the ``command``
                                                  string at the
                                                  :func:`_build_config`
                                                  level; everything
                                                  downstream stays the
                                                  same.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

from lexflow.mcp_servers import (
    BUILTIN_SERVERS,
    load_user_servers,
)
from lexflow.mcp_servers.schemas import McpServerCommand

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExternalToolSpec:
    """One tool surfaced by an attached external MCP server.

    ``server_name`` is the server's display name from ``mcp.json``
    (e.g. ``"fetch"``); ``name`` is the tool name as the server reports
    it. The agentic loop builds the disambiguated id
    ``f"{server_name}:{name}"`` so two servers exposing a ``search``
    tool can co-exist.
    """

    server_name: str
    name: str
    description: str
    parameters: dict[str, Any]

    @property
    def qualified_name(self) -> str:
        """Server-prefixed identifier (``"fetch:fetch"``, ``"fs:read_file"``)."""
        return f"{self.server_name}:{self.name}"


class _SupportsListTools(Protocol):
    """Minimal surface we need from ``fastmcp.Client`` (or a test fake)."""

    async def list_tools(self) -> list[Any]: ...


class _ClientFactory(Protocol):
    """Factory that turns a server command into a connected client.

    Injected so tests can supply a fake and we don't spawn real
    subprocesses in the test suite. Default is
    :func:`_default_client_factory`.
    """

    async def __call__(self, server_name: str, command: McpServerCommand) -> _SupportsListTools | None: ...


async def _default_client_factory(server_name: str, command: McpServerCommand) -> _SupportsListTools | None:
    """Construct a real ``fastmcp.Client`` for the given server.

    Returns ``None`` and logs a warning when the import or connection
    fails — the caller is expected to degrade gracefully (the server's
    tools just don't show up in the merged list).

    Kept out of the class so tests can replace it via a module-level
    patch without touching :class:`MCPMultiClient` internals.
    """
    try:
        from fastmcp import Client
    except ImportError:
        logger.warning("fastmcp not installed; skipping MCP server %s", repr(server_name))
        return None
    config = _build_config(server_name, command)
    if config is None:
        return None
    try:
        return Client(config)
    except Exception:
        logger.warning("Failed to construct MCP client for %s", repr(server_name), exc_info=True)
        return None


def _build_config(server_name: str, command: McpServerCommand) -> dict[str, Any] | None:
    """Convert our ``McpServerCommand`` into the fastmcp.Client config.

    The Claude Desktop schema (which we store) and fastmcp's transport
    config converge on the same shape — ``{command, args, env}`` for
    stdio and ``{url}`` for remote. We just relay it.
    """
    if command.command:
        return {
            "command": command.command,
            "args": list(command.args),
            "env": dict(command.env),
        }
    if command.url:
        return {"url": command.url}
    logger.warning("MCP server %s has neither command nor url", repr(server_name))
    return None


def _all_attached_servers() -> list[tuple[str, McpServerCommand]]:
    """Return the (name, command) pairs for every server we'll attach.

    Built-ins are always attached. User entries respect their
    ``enabled`` flag — disabled rows are silently skipped, matching
    the Settings UI's "muted" state.
    """
    attached: list[tuple[str, McpServerCommand]] = []
    for builtin in BUILTIN_SERVERS:
        attached.append((builtin.name, builtin.command))
    for user in load_user_servers():
        if user.enabled:
            attached.append((user.name, user.command))
    return attached


class MCPMultiClient:
    """Fan-out client across every enabled MCP server.

    Build via :meth:`from_config` (the live ``mcp.json`` path) or
    construct directly with a custom factory in tests.

    Connections are cached per server name. Failure to connect a
    single server is non-fatal: its tools just don't appear in the
    merged catalogue, and the rest keep working.
    """

    def __init__(self, *, client_factory: _ClientFactory = _default_client_factory) -> None:
        self._client_factory = client_factory
        self._clients: dict[str, _SupportsListTools] = {}

    @classmethod
    def from_config(cls) -> MCPMultiClient:
        """Default constructor: read the live ``mcp.json`` snapshot."""
        return cls()

    async def list_tools(self) -> list[ExternalToolSpec]:
        """Return every tool from every enabled external server.

        Tools are tagged with their ``server_name`` so the agentic
        loop can route dispatches back to the right connection.
        """
        catalogue: list[ExternalToolSpec] = []
        for server_name, command in _all_attached_servers():
            client = await self._connect_to(server_name, command)
            if client is None:
                continue
            try:
                tools = await client.list_tools()
            except Exception:
                logger.warning("list_tools failed on MCP server %s", repr(server_name), exc_info=True)
                continue
            for tool in tools:
                spec = _to_external_spec(server_name, tool)
                if spec is not None:
                    catalogue.append(spec)
        return catalogue

    async def _connect_to(self, server_name: str, command: McpServerCommand) -> _SupportsListTools | None:
        """Connect lazily, cache the result for the lifetime of this client."""
        if server_name in self._clients:
            return self._clients[server_name]
        client = await self._client_factory(server_name, command)
        if client is not None:
            self._clients[server_name] = client
        return client


def _to_external_spec(server_name: str, tool: Any) -> ExternalToolSpec | None:
    """Coerce a tool object from ``fastmcp.Client.list_tools`` into our shape.

    ``fastmcp`` returns objects with ``.name``, ``.description`` and
    ``.inputSchema`` (JSON-schema dict). We accept duck-typed dicts too
    so tests don't have to import the SDK.
    """
    name = _attr_or_key(tool, "name")
    description = _attr_or_key(tool, "description") or ""
    schema = _attr_or_key(tool, "inputSchema") or _attr_or_key(tool, "parameters") or {}
    if not isinstance(name, str) or not name:
        return None
    if not isinstance(schema, dict):
        return None
    return ExternalToolSpec(
        server_name=server_name,
        name=name,
        description=str(description),
        parameters=schema,
    )


def _attr_or_key(obj: Any, name: str) -> Any:
    """Read ``name`` from ``obj`` whether it's an object or a dict."""
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


# Convenience for the API layer — pre-builds a per-request client.
async def list_all_external_tools() -> list[ExternalToolSpec]:
    """One-shot helper. Returns the merged tool catalogue."""
    client = MCPMultiClient.from_config()
    return await client.list_tools()
