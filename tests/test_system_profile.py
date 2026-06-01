"""Tests for the /system/profile endpoint + the underlying detector (#117).

Strategy:
    - Unit-test the helpers (`_collect_memory_info`, `_collect_cpu_cores`,
      `_collect_gpu_info`, `_detect_apple_silicon`) by monkey-patching
      their underlying syscalls. The point isn't to test psutil itself —
      it's to confirm we convert bytes → GiB correctly, gracefully fail
      when NVML is absent, and never raise on the happy paths.
    - Probe-test `_probe_ollama` / `_probe_lmstudio` with `respx` /
      `httpx.MockTransport` so we cover the timeout + JSON-decode paths.
    - Integration-test the endpoint via `TestClient` with the
      orchestrator monkey-patched to a known fixture so we don't depend
      on a real Ollama instance during CI.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from lexflow.core import system_profile as sp_module
from lexflow.core.system_profile import (
    GpuInfo,
    SystemProfile,
    _collect_cpu_cores,
    _collect_gpu_info,
    _collect_memory_info,
    _detect_apple_silicon,
    _platform_label,
    _probe_lmstudio,
    _probe_ollama,
    build_system_profile,
)

# ─── Hardware helpers ────────────────────────────────────────────────────


class TestMemoryInfo:
    def test_converts_bytes_to_gib_rounded_to_one_decimal(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class FakeVm:
            total = 16 * 1024**3
            available = 9 * 1024**3 + 500 * 1024**2

        monkeypatch.setattr(sp_module.psutil, "virtual_memory", lambda: FakeVm())
        total, available = _collect_memory_info()
        assert total == 16.0
        # 9 GiB + 500 MiB ≈ 9.5 GiB.
        assert available == 9.5


class TestCpuCores:
    def test_returns_at_least_one_even_when_psutil_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sp_module.psutil, "cpu_count", lambda logical=True: None)
        assert _collect_cpu_cores() == 1

    def test_returns_logical_count(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sp_module.psutil, "cpu_count", lambda logical=True: 24)
        assert _collect_cpu_cores() == 24


# ─── GPU detection ───────────────────────────────────────────────────────


class TestGpuInfo:
    def test_returns_empty_when_pynvml_import_fails(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The wizard must work on machines without an NVIDIA SDK."""
        import builtins

        real_import = builtins.__import__

        def block_pynvml(name: str, *args: Any, **kwargs: Any) -> Any:
            if name == "pynvml":
                raise ImportError("simulated missing pynvml")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", block_pynvml)
        info = _collect_gpu_info()
        assert info == GpuInfo(present=False, vram_gb=None, name=None)

    def test_returns_empty_when_nvml_init_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """No driver loaded → wizard sees no GPU, no traceback."""

        # NVML's public API uses camelCase verbatim, so the fakes mirror
        # those names. noqa: N802 throughout this class for the same reason.
        class FakeNvml:
            @staticmethod
            def nvmlInit() -> None:  # noqa: N802
                raise RuntimeError("driver not loaded")

        monkeypatch.setitem(__import__("sys").modules, "pynvml", FakeNvml)
        assert _collect_gpu_info().present is False

    def test_returns_first_device_when_at_least_one_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class FakeMem:
            total = 24 * 1024**3

        shutdown_calls = []

        class FakeNvml:
            @staticmethod
            def nvmlInit() -> None: ...  # noqa: N802

            @staticmethod
            def nvmlDeviceGetCount() -> int:  # noqa: N802
                return 1

            @staticmethod
            def nvmlDeviceGetHandleByIndex(idx: int) -> str:  # noqa: N802
                return f"handle-{idx}"

            @staticmethod
            def nvmlDeviceGetMemoryInfo(handle: str) -> FakeMem:  # noqa: N802
                return FakeMem()

            @staticmethod
            def nvmlDeviceGetName(handle: str) -> bytes:  # noqa: N802
                return b"NVIDIA GeForce RTX 4090"

            @staticmethod
            def nvmlShutdown() -> None:  # noqa: N802
                shutdown_calls.append(True)

        monkeypatch.setitem(__import__("sys").modules, "pynvml", FakeNvml)
        info = _collect_gpu_info()
        assert info.present is True
        assert info.vram_gb == 24.0
        assert info.name == "NVIDIA GeForce RTX 4090"
        # Shutdown must run even on the happy path to release the NVML lib.
        assert shutdown_calls == [True]


# ─── Platform ────────────────────────────────────────────────────────────


class TestPlatform:
    def test_apple_silicon_only_when_darwin_and_arm64(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sp_module.platform, "system", lambda: "Darwin")
        monkeypatch.setattr(sp_module.platform, "machine", lambda: "arm64")
        assert _detect_apple_silicon() is True

    def test_intel_mac_is_not_apple_silicon(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sp_module.platform, "system", lambda: "Darwin")
        monkeypatch.setattr(sp_module.platform, "machine", lambda: "x86_64")
        assert _detect_apple_silicon() is False

    def test_linux_arm64_is_not_apple_silicon(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sp_module.platform, "system", lambda: "Linux")
        monkeypatch.setattr(sp_module.platform, "machine", lambda: "arm64")
        assert _detect_apple_silicon() is False

    def test_platform_label_is_lowercase(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sp_module.platform, "system", lambda: "Windows")
        assert _platform_label() == "windows"


# ─── Local provider probes ───────────────────────────────────────────────


def _client_with_handler(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=handler)


class TestOllamaProbe:
    async def test_returns_model_names_when_server_is_up(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"models": [{"name": "llama3.2:3b"}, {"name": "qwen2.5:7b"}]})

        async with _client_with_handler(httpx.MockTransport(respond)) as client:
            running, models = await _probe_ollama(client)
        assert running is True
        assert models == ["llama3.2:3b", "qwen2.5:7b"]

    async def test_returns_empty_on_connection_failure(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        async with _client_with_handler(httpx.MockTransport(respond)) as client:
            running, models = await _probe_ollama(client)
        assert running is False
        assert models == []

    async def test_returns_empty_on_malformed_json(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b"not-json", headers={"content-type": "application/json"})

        async with _client_with_handler(httpx.MockTransport(respond)) as client:
            running, models = await _probe_ollama(client)
        assert running is False
        assert models == []


class TestLmStudioProbe:
    async def test_returns_true_when_endpoint_responds(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"data": []})

        async with _client_with_handler(httpx.MockTransport(respond)) as client:
            assert await _probe_lmstudio(client) is True

    async def test_returns_false_when_endpoint_fails(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        async with _client_with_handler(httpx.MockTransport(respond)) as client:
            assert await _probe_lmstudio(client) is False


# ─── Endpoint integration ────────────────────────────────────────────────


_FAKE_PROFILE = SystemProfile(
    total_ram_gb=32.0,
    available_ram_gb=18.5,
    cpu_cores=16,
    has_nvidia_gpu=True,
    vram_gb=12.0,
    gpu_name="NVIDIA GeForce RTX 4070",
    is_apple_silicon=False,
    platform="linux",
    ollama_running=True,
    ollama_models=["llama3.2:3b"],
    lmstudio_running=False,
)


class TestSystemProfileEndpoint:
    def test_endpoint_returns_snapshot(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        async def fake_build() -> SystemProfile:
            return _FAKE_PROFILE

        monkeypatch.setattr("lexflow.api.routers.system.build_system_profile", fake_build)
        response = client.get("/api/v1/system/profile")
        assert response.status_code == 200
        body = response.json()
        assert body["total_ram_gb"] == 32.0
        assert body["cpu_cores"] == 16
        assert body["has_nvidia_gpu"] is True
        assert body["vram_gb"] == 12.0
        assert body["gpu_name"] == "NVIDIA GeForce RTX 4070"
        assert body["is_apple_silicon"] is False
        assert body["platform"] == "linux"
        assert body["ollama_running"] is True
        assert body["ollama_models"] == ["llama3.2:3b"]
        assert body["lmstudio_running"] is False

    def test_orchestrator_runs_against_real_host(self) -> None:
        """Smoke-test against the real machine — the only guarantees are
        that we don't raise, RAM is positive, and the platform label is
        one of the three we know about."""
        import asyncio

        profile = asyncio.run(build_system_profile())
        assert profile.total_ram_gb > 0
        assert profile.cpu_cores >= 1
        assert profile.platform in {"linux", "darwin", "windows"}
