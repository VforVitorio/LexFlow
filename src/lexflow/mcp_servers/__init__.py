"""MCP server registry — persistence + builtin catalog (#122).

LexFlow ships a small catalog of MCP servers we recommend (the
in-process lexflow-legal server first, then a couple of community
servers) and lets the user add their own. Both lists land in the
Settings → MCP Servers UI; the user list is the only mutable surface.

Persistence file: ``<Settings.config_dir>/mcp.json``. Schema deliberately
mirrors Claude Desktop's ``claude_desktop_config.json`` so a copy of
that file works as-is and our writes stay portable to other MCP
clients (Cursor, Continue, etc.).

--- WHERE TO CHANGE IF X CHANGES ---
* Built-in catalog        → :data:`BUILTIN_SERVERS`.
* Persistence format       → :func:`load_user_servers` / :func:`save_user_servers`.
* Schema                   → :mod:`lexflow.mcp_servers.schemas`.
"""

from __future__ import annotations

from lexflow.mcp_servers.builtins import BUILTIN_SERVERS
from lexflow.mcp_servers.config import (
    MCP_CONFIG_FILENAME,
    load_user_servers,
    save_user_servers,
)
from lexflow.mcp_servers.schemas import (
    BUILTIN_LEXFLOW_LEGAL_NAME,
    BuiltinMcpServer,
    McpServerCommand,
    McpServerCreateRequest,
    McpServerListResponse,
    McpServerPatchRequest,
    McpServerView,
    UserMcpServerEntry,
)

__all__ = [
    "BUILTIN_LEXFLOW_LEGAL_NAME",
    "BUILTIN_SERVERS",
    "MCP_CONFIG_FILENAME",
    "BuiltinMcpServer",
    "McpServerCommand",
    "McpServerCreateRequest",
    "McpServerListResponse",
    "McpServerPatchRequest",
    "McpServerView",
    "UserMcpServerEntry",
    "load_user_servers",
    "save_user_servers",
]
