"""Tests for the loopback-bind security boundary in ``main.py`` (#885, S1.3).

``main()`` itself starts a real uvicorn server, so these tests exercise
the pure decision function :func:`main._resolve_bind_host` instead —
same coverage without spinning up a process.
"""

from __future__ import annotations

import main
import pytest
from pytest import MonkeyPatch


class TestIsLoopbackHost:
    @pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1"])
    def test_loopback_literals_and_names(self, host: str) -> None:
        assert main._is_loopback_host(host) is True

    @pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.10", "10.0.0.5"])
    def test_non_loopback_addresses(self, host: str) -> None:
        assert main._is_loopback_host(host) is False

    def test_unresolvable_hostname_is_treated_as_non_loopback(self) -> None:
        assert main._is_loopback_host("this-host-does-not-resolve.invalid") is False


class TestResolveBindHost:
    def test_default_host_is_loopback(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.delenv("LEXFLOW_HOST", raising=False)
        monkeypatch.delenv("LEXFLOW_ALLOW_UNSAFE_NETWORK_BIND", raising=False)
        assert main._resolve_bind_host() == main.DEFAULT_HOST

    def test_explicit_loopback_host_is_allowed(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_HOST", "127.0.0.1")
        monkeypatch.delenv("LEXFLOW_ALLOW_UNSAFE_NETWORK_BIND", raising=False)
        assert main._resolve_bind_host() == "127.0.0.1"

    def test_non_loopback_without_opt_in_raises(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_HOST", "0.0.0.0")
        monkeypatch.delenv("LEXFLOW_ALLOW_UNSAFE_NETWORK_BIND", raising=False)
        with pytest.raises(RuntimeError, match="Refusing to bind"):
            main._resolve_bind_host()

    def test_non_loopback_with_opt_in_succeeds(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_HOST", "0.0.0.0")
        monkeypatch.setenv("LEXFLOW_ALLOW_UNSAFE_NETWORK_BIND", "1")
        assert main._resolve_bind_host() == "0.0.0.0"

    def test_opt_in_wrong_value_still_raises(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("LEXFLOW_HOST", "0.0.0.0")
        monkeypatch.setenv("LEXFLOW_ALLOW_UNSAFE_NETWORK_BIND", "true")
        with pytest.raises(RuntimeError, match="Refusing to bind"):
            main._resolve_bind_host()
