"""Tests for the keyring-backed API key store (#120).

Uses an in-process fake keyring backend so the tests touch zero OS
state. The fake honours ``set_password`` / ``get_password`` /
``delete_password`` semantics, which is all our code uses.
"""

from __future__ import annotations

import keyring
import keyring.backend
import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from lexflow.chat import secrets as secrets_mod


class _FakeKeyring(keyring.backend.KeyringBackend):
    """In-memory keyring backend.

    Priority must be > 0 for keyring to consider us; the actual value
    doesn't matter as long as we override the active backend.
    """

    priority = 1  # type: ignore[assignment]

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, username: str) -> str | None:
        return self._store.get((service, username))

    def set_password(self, service: str, username: str, password: str) -> None:
        self._store[(service, username)] = password

    def delete_password(self, service: str, username: str) -> None:
        # keyring's contract: raise PasswordDeleteError when absent.
        # Our wrapper guards with a prior get, so the raise path
        # doesn't trigger in normal use.
        try:
            del self._store[(service, username)]
        except KeyError as exc:
            from keyring.errors import PasswordDeleteError

            raise PasswordDeleteError(f"no such password: {(service, username)}") from exc


@pytest.fixture(autouse=True)
def _isolated_keyring(monkeypatch: MonkeyPatch) -> _FakeKeyring:
    """Swap the active keyring backend AND clear matching env vars.

    The env-var fallback wins over the keyring, so any
    ``OPENAI_API_KEY`` left in the dev shell would taint the tests.
    """
    fake = _FakeKeyring()
    monkeypatch.setattr(keyring, "get_keyring", lambda: fake)
    monkeypatch.setattr(keyring, "set_password", fake.set_password)
    monkeypatch.setattr(keyring, "get_password", fake.get_password)
    monkeypatch.setattr(keyring, "delete_password", fake.delete_password)
    for env_var in secrets_mod._PROVIDER_ENV.values():
        monkeypatch.delenv(env_var, raising=False)
    return fake


# ─── Module-level API ──────────────────────────────────────────────────


class TestSetGetDelete:
    def test_set_then_get_returns_value(self) -> None:
        secrets_mod.set_api_key("openai", "sk-test-openai")
        assert secrets_mod.get_api_key("openai") == "sk-test-openai"

    def test_get_returns_none_when_absent(self) -> None:
        assert secrets_mod.get_api_key("anthropic") is None

    def test_delete_returns_true_when_present(self) -> None:
        secrets_mod.set_api_key("openai", "x")
        assert secrets_mod.delete_api_key("openai") is True
        assert secrets_mod.get_api_key("openai") is None

    def test_delete_returns_false_when_absent(self) -> None:
        assert secrets_mod.delete_api_key("openai") is False

    def test_empty_key_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="must not be empty"):
            secrets_mod.set_api_key("openai", "")

    def test_unknown_provider_raises_on_set(self) -> None:
        with pytest.raises(secrets_mod.UnknownProviderError):
            secrets_mod.set_api_key("nope", "x")

    def test_unknown_provider_raises_on_get(self) -> None:
        with pytest.raises(secrets_mod.UnknownProviderError):
            secrets_mod.get_api_key("nope")


class TestEnvVarFallback:
    def test_env_var_wins_over_keyring(self, monkeypatch: MonkeyPatch) -> None:
        secrets_mod.set_api_key("openai", "from-keyring")
        monkeypatch.setenv("OPENAI_API_KEY", "from-env")
        assert secrets_mod.get_api_key("openai") == "from-env"

    def test_env_var_used_when_keyring_empty(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("ANTHROPIC_API_KEY", "env-only")
        assert secrets_mod.get_api_key("anthropic") == "env-only"


class TestConfiguredProviders:
    def test_reports_per_provider_state(self) -> None:
        secrets_mod.set_api_key("openai", "x")
        snapshot = secrets_mod.configured_providers()
        assert snapshot == {"anthropic": False, "google": False, "openai": True}

    def test_env_var_counts_as_configured(self, monkeypatch: MonkeyPatch) -> None:
        monkeypatch.setenv("GOOGLE_API_KEY", "from-env")
        snapshot = secrets_mod.configured_providers()
        assert snapshot["google"] is True


# ─── HTTP endpoints ─────────────────────────────────────────────────────


class TestSecretsEndpoints:
    def test_get_lists_every_supported_provider(self, client: TestClient) -> None:
        response = client.get("/api/v1/secrets")
        assert response.status_code == 200
        items = response.json()["items"]
        providers = {item["provider"] for item in items}
        assert providers == {"openai", "anthropic", "google"}
        # All start unconfigured (isolated keyring + cleared env vars).
        assert all(item["configured"] is False for item in items)

    def test_post_stores_and_get_reflects(self, client: TestClient) -> None:
        post = client.post(
            "/api/v1/secrets",
            json={"provider": "openai", "api_key": "sk-stored"},
        )
        assert post.status_code == 204
        listed = {i["provider"]: i["configured"] for i in client.get("/api/v1/secrets").json()["items"]}
        assert listed["openai"] is True

    def test_post_never_echoes_key(self, client: TestClient) -> None:
        # 204 → no body. Belt-and-braces in case future code adds one.
        response = client.post(
            "/api/v1/secrets",
            json={"provider": "openai", "api_key": "sk-secret-don't-leak"},
        )
        assert response.text == ""
        assert "sk-secret" not in response.text

    def test_post_unknown_provider_returns_400(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/secrets",
            json={"provider": "nope", "api_key": "x"},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "unknown_provider"

    def test_post_empty_key_returns_400(self, client: TestClient) -> None:
        # Pydantic catches the empty string via ``min_length=1`` before
        # our handler runs — it's a 422 validation error there.
        response = client.post(
            "/api/v1/secrets",
            json={"provider": "openai", "api_key": ""},
        )
        assert response.status_code == 422

    def test_delete_is_idempotent(self, client: TestClient) -> None:
        client.post(
            "/api/v1/secrets",
            json={"provider": "openai", "api_key": "x"},
        )
        first = client.delete("/api/v1/secrets/openai")
        second = client.delete("/api/v1/secrets/openai")
        assert first.status_code == 204
        assert second.status_code == 204

    def test_delete_unknown_provider_returns_400(self, client: TestClient) -> None:
        response = client.delete("/api/v1/secrets/nope")
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "unknown_provider"
