"""Tests for the internal MCP client and ``GET /api/v1/mcp/tools`` (#121).

Real ``fastmcp.Client`` would spawn subprocesses — we inject a fake
factory so the suite stays hermetic. Coverage:

- ``MCPMultiClient.list_tools`` merges tools across multiple servers
  and tags each with ``server_name``.
- Connection failures on one server don't poison the whole list.
- Disabled user servers are skipped.
- ``GET /api/v1/mcp/tools`` returns the merged catalogue.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.chat.mcp_client import MCPMultiClient
from lexflow.mcp_servers.schemas import McpServerCommand


class _FakeClient:
    """Stand-in for ``fastmcp.Client``."""

    def __init__(self, tools: list[dict[str, Any]] | Exception) -> None:
        self._tools = tools

    async def list_tools(self) -> list[Any]:
        if isinstance(self._tools, Exception):
            raise self._tools
        return list(self._tools)


@pytest.fixture()
def _no_user_servers(monkeypatch: MonkeyPatch) -> None:
    """Pretend ``mcp.json`` is empty — tests don't need to touch disk."""
    from lexflow.chat import mcp_client as mcp_client_mod

    monkeypatch.setattr(mcp_client_mod, "load_user_servers", lambda: [])


@pytest.fixture()
def _no_builtins(monkeypatch: MonkeyPatch) -> None:
    """Mute the built-in catalogue so a test can pin the attached list."""
    from lexflow.chat import mcp_client as mcp_client_mod

    monkeypatch.setattr(mcp_client_mod, "BUILTIN_SERVERS", [])


# ─── Module-level: MCPMultiClient ──────────────────────────────────────


class TestMCPMultiClientMerging:
    @pytest.mark.asyncio
    async def test_merges_tools_across_servers(self, monkeypatch: MonkeyPatch) -> None:
        from lexflow.chat import mcp_client as mcp_client_mod
        from lexflow.mcp_servers.schemas import BuiltinMcpServer

        monkeypatch.setattr(
            mcp_client_mod,
            "BUILTIN_SERVERS",
            [
                BuiltinMcpServer(name="fetch", description="", command=McpServerCommand(command="echo")),
                BuiltinMcpServer(name="fs", description="", command=McpServerCommand(command="echo")),
            ],
        )
        monkeypatch.setattr(mcp_client_mod, "load_user_servers", lambda: [])

        tools_by_server = {
            "fetch": [{"name": "fetch_url", "description": "GET a URL", "inputSchema": {"type": "object"}}],
            "fs": [
                {"name": "read_file", "description": "Read a file", "inputSchema": {"type": "object"}},
                {"name": "write_file", "description": "Write a file", "inputSchema": {"type": "object"}},
            ],
        }

        async def _factory(server_name: str, command: McpServerCommand) -> _FakeClient:
            return _FakeClient(tools_by_server[server_name])

        client = MCPMultiClient(client_factory=_factory)  # type: ignore[arg-type]
        tools = await client.list_tools()
        qualified = sorted(t.qualified_name for t in tools)
        assert qualified == ["fetch:fetch_url", "fs:read_file", "fs:write_file"]

    @pytest.mark.asyncio
    async def test_skips_servers_that_fail_to_connect(
        self,
        monkeypatch: MonkeyPatch,
        _no_user_servers: None,
    ) -> None:
        from lexflow.chat import mcp_client as mcp_client_mod
        from lexflow.mcp_servers.schemas import BuiltinMcpServer

        monkeypatch.setattr(
            mcp_client_mod,
            "BUILTIN_SERVERS",
            [
                BuiltinMcpServer(name="good", description="", command=McpServerCommand(command="echo")),
                BuiltinMcpServer(name="broken", description="", command=McpServerCommand(command="echo")),
            ],
        )

        async def _factory(server_name: str, command: McpServerCommand) -> _FakeClient | None:
            if server_name == "broken":
                return None  # construction failure
            return _FakeClient([{"name": "ping", "description": "", "inputSchema": {}}])

        client = MCPMultiClient(client_factory=_factory)  # type: ignore[arg-type]
        tools = await client.list_tools()
        assert [t.qualified_name for t in tools] == ["good:ping"]

    @pytest.mark.asyncio
    async def test_skips_servers_whose_list_tools_raises(
        self,
        monkeypatch: MonkeyPatch,
        _no_user_servers: None,
    ) -> None:
        from lexflow.chat import mcp_client as mcp_client_mod
        from lexflow.mcp_servers.schemas import BuiltinMcpServer

        monkeypatch.setattr(
            mcp_client_mod,
            "BUILTIN_SERVERS",
            [BuiltinMcpServer(name="bad", description="", command=McpServerCommand(command="echo"))],
        )

        async def _factory(server_name: str, command: McpServerCommand) -> _FakeClient:
            return _FakeClient(RuntimeError("transport closed"))

        client = MCPMultiClient(client_factory=_factory)  # type: ignore[arg-type]
        tools = await client.list_tools()
        assert tools == []

    @pytest.mark.asyncio
    async def test_disabled_user_servers_are_skipped(self, monkeypatch: MonkeyPatch, _no_builtins: None) -> None:
        from lexflow.chat import mcp_client as mcp_client_mod
        from lexflow.mcp_servers.schemas import UserMcpServerEntry

        attached = [
            UserMcpServerEntry(name="on", description="", command=McpServerCommand(command="echo"), enabled=True),
            UserMcpServerEntry(name="off", description="", command=McpServerCommand(command="echo"), enabled=False),
        ]
        monkeypatch.setattr(mcp_client_mod, "load_user_servers", lambda: attached)

        calls: list[str] = []

        async def _factory(server_name: str, command: McpServerCommand) -> _FakeClient:
            calls.append(server_name)
            return _FakeClient([{"name": "ping", "description": "", "inputSchema": {}}])

        client = MCPMultiClient(client_factory=_factory)  # type: ignore[arg-type]
        await client.list_tools()
        assert calls == ["on"]


# ─── HTTP endpoint ─────────────────────────────────────────────────────


class TestMcpToolsEndpoint:
    def test_returns_merged_catalogue(
        self,
        client: TestClient,
        monkeypatch: MonkeyPatch,
    ) -> None:
        from lexflow.chat import mcp_client as mcp_client_mod
        from lexflow.chat.mcp_client import ExternalToolSpec

        async def _fake_list_all() -> list[ExternalToolSpec]:
            return [
                ExternalToolSpec(
                    server_name="fetch",
                    name="fetch_url",
                    description="GET",
                    parameters={"type": "object"},
                ),
                ExternalToolSpec(
                    server_name="fs",
                    name="read_file",
                    description="Read",
                    parameters={"type": "object"},
                ),
            ]

        # Patch where the router imports it (function-level binding).
        from lexflow.api.routers import mcp_servers as router_mod

        monkeypatch.setattr(router_mod, "list_all_external_tools", _fake_list_all)
        del mcp_client_mod  # not needed once we patched at the router

        response = client.get("/api/v1/mcp/tools")
        assert response.status_code == 200
        items = response.json()["items"]
        assert {it["qualified_name"] for it in items} == {"fetch:fetch_url", "fs:read_file"}
        for it in items:
            assert "name" in it and "server_name" in it and "description" in it
