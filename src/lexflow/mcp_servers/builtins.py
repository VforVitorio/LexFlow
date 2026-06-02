"""Built-in MCP server catalog (#122).

Single source of truth for the read-only entries the Settings page
shows above the user-added list. Adding a new built-in is a one-liner
here — both the API and the SPA pick it up via the same response.
"""

from __future__ import annotations

from lexflow.mcp_servers.schemas import (
    BUILTIN_LEXFLOW_LEGAL_NAME,
    BuiltinMcpServer,
    McpServerCommand,
)

BUILTIN_SERVERS: list[BuiltinMcpServer] = [
    BuiltinMcpServer(
        name=BUILTIN_LEXFLOW_LEGAL_NAME,
        description=(
            "LexFlow's own MCP server. Exposes search_law / get_law / "
            "get_article / get_stats over the legalize-es corpus, audited via "
            "the hash-chained ``mcp.log`` (#124)."
        ),
        command=McpServerCommand(
            command="uv",
            args=["run", "python", "-m", "lexflow.chat.mcp_server"],
        ),
        docs_url="https://github.com/VforVitorio/LexFlow",
    ),
]
