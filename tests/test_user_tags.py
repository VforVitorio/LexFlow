"""Tests for the personal user-tags endpoints (issue #670).

Covers the five endpoints:

* ``GET    /laws/{law_id}/user-tags``       — list a law's tags
* ``POST   /laws/{law_id}/user-tags``       — attach a tag (idempotent)
* ``DELETE /laws/{law_id}/user-tags/{tag}`` — remove a tag (idempotent)
* ``GET    /user-tags``                     — global vocabulary, ranked
* ``GET    /user-tags/{tag}/laws``          — laws carrying a tag

Each test gets a fresh isolated SQLite DB via the autouse
``_isolated_chat_db`` fixture in ``conftest.py`` — the user-tags table
lives in the same file as the chat tables, so that fixture already
covers it.

The ``models`` import below is required so ``UserTag`` registers on
``SQLModel.metadata`` for the autouse ``create_all`` fixture — this
must hold even before the router is wired into ``lexflow.api.app``.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from httpx import Response

from lexflow.user_tags import models  # noqa: F401


def _add_tag(client: TestClient, law_id: str, label: str) -> Response:
    """POST a tag; caller asserts on the returned response."""
    return client.post(f"/api/v1/laws/{law_id}/user-tags", json={"label": label})


class TestAddUserTag:
    def test_add_returns_201_with_tag_and_label(self, client: TestClient) -> None:
        response = _add_tag(client, "BOE-A-2000-323", "Revisar urgente")
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["tag"] == "revisar-urgente"
        assert body["label"] == "Revisar urgente"

    def test_add_is_idempotent(self, client: TestClient) -> None:
        first = _add_tag(client, "BOE-A-2000-323", "Revisar urgente")
        assert first.status_code == 201

        second = _add_tag(client, "BOE-A-2000-323", "Revisar urgente")
        assert second.status_code == 200
        assert second.json() == first.json()

        listing = client.get("/api/v1/laws/BOE-A-2000-323/user-tags").json()
        assert len(listing["items"]) == 1

    def test_slug_normalisation_ascii(self, client: TestClient) -> None:
        response = _add_tag(client, "BOE-A-2000-323", "Revisar Urgente")
        assert response.json()["tag"] == "revisar-urgente"

    def test_slug_normalisation_accents(self, client: TestClient) -> None:
        response = _add_tag(client, "BOE-A-2000-323", "Protección")
        assert response.json()["tag"] == "proteccion"

    def test_add_rejects_label_empty_after_normalisation(self, client: TestClient) -> None:
        response = _add_tag(client, "BOE-A-2000-323", "!!!")
        assert response.status_code == 422

    def test_add_rejects_empty_body_label(self, client: TestClient) -> None:
        response = client.post("/api/v1/laws/BOE-A-2000-323/user-tags", json={"label": ""})
        assert response.status_code == 422


class TestListUserTags:
    def test_list_returns_a_laws_tags(self, client: TestClient) -> None:
        _add_tag(client, "BOE-A-2000-323", "urgente")
        _add_tag(client, "BOE-A-2000-323", "revisado")
        _add_tag(client, "OTHER-LAW", "urgente")

        listing = client.get("/api/v1/laws/BOE-A-2000-323/user-tags").json()
        tags = {item["tag"] for item in listing["items"]}
        assert tags == {"urgente", "revisado"}

    def test_list_is_empty_for_untagged_law(self, client: TestClient) -> None:
        listing = client.get("/api/v1/laws/NEVER-TAGGED/user-tags").json()
        assert listing["items"] == []


class TestDeleteUserTag:
    def test_delete_removes_the_tag(self, client: TestClient) -> None:
        _add_tag(client, "BOE-A-2000-323", "urgente")

        delete_response = client.delete("/api/v1/laws/BOE-A-2000-323/user-tags/urgente")
        assert delete_response.status_code == 204

        listing = client.get("/api/v1/laws/BOE-A-2000-323/user-tags").json()
        assert listing["items"] == []

    def test_delete_is_idempotent(self, client: TestClient) -> None:
        first = client.delete("/api/v1/laws/BOE-A-2000-323/user-tags/never-added")
        assert first.status_code == 204
        second = client.delete("/api/v1/laws/BOE-A-2000-323/user-tags/never-added")
        assert second.status_code == 204

    def test_delete_only_removes_matching_law(self, client: TestClient) -> None:
        _add_tag(client, "LAW-A", "urgente")
        _add_tag(client, "LAW-B", "urgente")

        client.delete("/api/v1/laws/LAW-A/user-tags/urgente")

        assert client.get("/api/v1/laws/LAW-A/user-tags").json()["items"] == []
        assert len(client.get("/api/v1/laws/LAW-B/user-tags").json()["items"]) == 1


class TestUserTagVocabulary:
    def test_two_laws_with_same_tag_count_two(self, client: TestClient) -> None:
        _add_tag(client, "LAW-A", "urgente")
        _add_tag(client, "LAW-B", "urgente")

        vocab = client.get("/api/v1/user-tags").json()
        entry = next(item for item in vocab["items"] if item["tag"] == "urgente")
        assert entry["count"] == 2

    def test_vocab_is_ranked_by_count_desc(self, client: TestClient) -> None:
        _add_tag(client, "LAW-A", "popular")
        _add_tag(client, "LAW-B", "popular")
        _add_tag(client, "LAW-C", "popular")
        _add_tag(client, "LAW-A", "rare")

        vocab = client.get("/api/v1/user-tags").json()
        tags_in_order = [item["tag"] for item in vocab["items"]]
        assert tags_in_order.index("popular") < tags_in_order.index("rare")

    def test_vocab_is_empty_when_no_tags_exist(self, client: TestClient) -> None:
        vocab = client.get("/api/v1/user-tags").json()
        assert vocab["items"] == []


class TestLawsForUserTag:
    def test_returns_the_right_law_ids(self, client: TestClient) -> None:
        _add_tag(client, "LAW-A", "urgente")
        _add_tag(client, "LAW-B", "urgente")
        _add_tag(client, "LAW-C", "otro")

        laws = client.get("/api/v1/user-tags/urgente/laws").json()
        assert sorted(laws["law_ids"]) == ["LAW-A", "LAW-B"]

    def test_returns_empty_for_unknown_tag(self, client: TestClient) -> None:
        laws = client.get("/api/v1/user-tags/never-used/laws").json()
        assert laws["law_ids"] == []
