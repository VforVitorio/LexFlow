"""LexFlow entry point — starts the FastAPI development server.

Security boundary (issue #885, S1.3): LexFlow has no auth layer — it's
a single-user local app that trusts "whoever can reach this port".
Binding to a non-loopback address turns that trust boundary into a
LAN-wide (or internet-wide, behind a bad NAT/firewall rule) unauth
RCE surface, since a networked MCP server config or ``/sync`` call is
reachable from anyone on the network. Loopback is therefore a **hard**
boundary: binding off-loopback requires an explicit opt-in env var, and
even then we log a loud warning so an operator doesn't ship it by
accident.
"""

from __future__ import annotations

import ipaddress
import logging
import os
import socket

import uvicorn

logger = logging.getLogger(__name__)

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000

# Explicit opt-in required to bind off-loopback. Named "unsafe" on
# purpose — there is no auth layer behind this bind yet, so exposing
# it beyond localhost really is unsafe today.
_UNSAFE_NETWORK_BIND_ENV = "LEXFLOW_ALLOW_UNSAFE_NETWORK_BIND"


def _is_loopback_host(host: str) -> bool:
    """Return whether *host* resolves only to loopback addresses.

    Accepts the common non-IP spellings (``localhost``) in addition to
    literal loopback IPs. Anything that fails to resolve is treated as
    non-loopback (fail closed) rather than silently allowed through.
    """
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        return literal.is_loopback
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError):
        return False
    return all(ipaddress.ip_address(info[4][0]).is_loopback for info in infos)


def _resolve_bind_host() -> str:
    """Read the configured bind host, enforcing the loopback boundary.

    Raises ``RuntimeError`` (crashing startup loudly, per CLAUDE.md's
    "fail loudly in dev" principle) when a non-loopback host is
    requested without the explicit unsafe opt-in.
    """
    host = os.environ.get("LEXFLOW_HOST", DEFAULT_HOST)
    if _is_loopback_host(host):
        return host
    if os.environ.get(_UNSAFE_NETWORK_BIND_ENV) != "1":
        raise RuntimeError(
            f"Refusing to bind LexFlow to non-loopback host {host!r}: LexFlow has no "
            "auth layer yet, so this would expose the API (and any spawned MCP server "
            f"commands) to your whole network. Set {_UNSAFE_NETWORK_BIND_ENV}=1 to "
            "override — only do this behind your own auth/firewall, never on an "
            "untrusted network."
        )
    logger.warning(
        "LexFlow is binding to non-loopback host %r (%s=1 set). "
        "There is NO authentication layer — anyone who can reach this host:port has "
        "full API + MCP access. Use a reverse proxy with real auth in front of it.",
        host,
        _UNSAFE_NETWORK_BIND_ENV,
    )
    return host


def main() -> None:
    host = _resolve_bind_host()
    port = int(os.environ.get("LEXFLOW_PORT", str(DEFAULT_PORT)))
    uvicorn.run(
        "lexflow.api.app:app",
        host=host,
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    main()
