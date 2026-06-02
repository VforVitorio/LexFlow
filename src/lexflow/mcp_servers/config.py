"""Persistence for user-added MCP servers (#122).

File: ``<Settings.config_dir>/mcp.json``. Schema mirrors Claude
Desktop's ``claude_desktop_config.json`` verbatim:

.. code-block:: json

    {
      "mcpServers": {
        "context-mode": {
          "command": "npx",
          "args": ["mksglu/context-mode"]
        }
      },
      "lexflow_enabled": { "context-mode": true }
    }

The ``lexflow_enabled`` block is an additive extension (prefixed with
``lexflow_`` per the project-wide convention from the audit schema)
that carries the per-server enabled flag. Older / foreign clients
that don't know about it simply ignore the field and treat every
server as enabled, which is the conservative default.

--- WHERE TO CHANGE IF X CHANGES ---
* Filename                 → :data:`MCP_CONFIG_FILENAME`.
* Add a per-server field   → extend :class:`UserMcpServerEntry` AND
                              update :func:`_to_disk_payload` /
                              :func:`_from_disk_payload`.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from lexflow.mcp_servers.schemas import McpServerCommand, UserMcpServerEntry
from lexflow.utils.config import get_settings

logger = logging.getLogger(__name__)

MCP_CONFIG_FILENAME = "mcp.json"


def _config_path() -> Path:
    """Absolute path to the user MCP config file."""
    return get_settings().config_dir / MCP_CONFIG_FILENAME


def _from_disk_payload(raw: dict[str, object]) -> list[UserMcpServerEntry]:
    """Convert the on-disk shape to a list of validated entries.

    Defensive: anything unexpected (wrong top-level shape, missing
    fields, unknown command shape) is treated as "no user entries" so
    a partially-broken file never breaks the API. The user can see the
    empty list in Settings and re-add the entries.
    """
    raw_servers = raw.get("mcpServers", {})
    if not isinstance(raw_servers, dict):
        logger.warning("mcp.json: 'mcpServers' is not an object; ignoring file")
        return []
    enabled_map_raw = raw.get("lexflow_enabled", {})
    enabled_map: dict[str, bool] = (
        {str(k): bool(v) for k, v in enabled_map_raw.items()} if isinstance(enabled_map_raw, dict) else {}
    )

    out: list[UserMcpServerEntry] = []
    for name, body in raw_servers.items():
        if not isinstance(body, dict):
            logger.warning("mcp.json: server %r body is not an object, skipping", name)
            continue
        try:
            command = McpServerCommand(
                command=body.get("command"),
                args=list(body.get("args") or []),
                env=dict(body.get("env") or {}),
                url=body.get("url"),
            )
            entry = UserMcpServerEntry(
                name=str(name),
                description=str(body.get("description", "")),
                command=command,
                # Missing entry in the extension block = enabled (Claude
                # Desktop semantics — every listed server runs by default).
                enabled=enabled_map.get(str(name), True),
            )
        except Exception as exc:  # Pydantic ValidationError, ValueError, TypeError
            logger.warning("mcp.json: server %r failed validation (%s), skipping", name, exc)
            continue
        out.append(entry)
    return out


def _to_disk_payload(entries: list[UserMcpServerEntry]) -> dict[str, object]:
    """Convert validated entries to the Claude Desktop-compatible shape."""
    servers: dict[str, dict[str, object]] = {}
    enabled: dict[str, bool] = {}
    for entry in entries:
        body: dict[str, object] = {}
        if entry.command.command is not None:
            body["command"] = entry.command.command
        if entry.command.args:
            body["args"] = list(entry.command.args)
        if entry.command.env:
            body["env"] = dict(entry.command.env)
        if entry.command.url is not None:
            body["url"] = entry.command.url
        if entry.description:
            body["description"] = entry.description
        servers[entry.name] = body
        enabled[entry.name] = entry.enabled
    return {"mcpServers": servers, "lexflow_enabled": enabled}


def load_user_servers() -> list[UserMcpServerEntry]:
    """Read + validate the user-added MCP servers from disk.

    Returns ``[]`` when the file is absent (first-launch baseline) or
    malformed beyond recovery. Logged warnings narrate what was
    skipped, but never raise — Settings must always render.
    """
    path = _config_path()
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        logger.warning("mcp.json: could not read/parse %s (%s); returning empty list", path, exc)
        return []
    if not isinstance(raw, dict):
        logger.warning("mcp.json: top-level value is not an object; ignoring file")
        return []
    return _from_disk_payload(raw)


def save_user_servers(entries: list[UserMcpServerEntry]) -> None:
    """Atomically persist *entries* to ``<config_dir>/mcp.json``.

    Writes to a temp file alongside, then ``os.replace`` to swap. This
    keeps the file always-valid: a crash between writes leaves either
    the old or the new file intact, never a half-written JSON.
    """
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _to_disk_payload(entries)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)
