"""Tests for the chat thread CRUD endpoints (issue #83).

Covers the five endpoints plus the ``POST /messages`` helper:

* paginated listing, including the ``preview`` field derived from the
  latest message;
* create / get / patch / delete round-trip;
* 404 on unknown ids;
* message append round-trip + cascade delete on the parent thread.

Each test gets a fresh isolated SQLite DB via the autouse
``_isolated_chat_db`` fixture in ``conftest.py`` — no cross-test bleed.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _create_thread(client: TestClient, **body: object) -> dict[str, object]:
    response = client.post("/api/v1/chat/threads", json=body)
    assert response.status_code == 201, response.text
    return response.json()


class TestThreadCrud:
    def test_create_returns_id_title_and_timestamps(self, client: TestClient) -> None:
        thread = _create_thread(client, title="Hola", model="openai:gpt-4o")
        assert thread["title"] == "Hola"
        assert thread["model"] == "openai:gpt-4o"
        assert thread["id"]
        assert thread["created_at"]
        assert thread["updated_at"]
        assert thread["preview"] is None

    def test_create_defaults_title_when_omitted(self, client: TestClient) -> None:
        thread = _create_thread(client)
        assert thread["title"] == "Nueva conversación"
        assert thread["model"] == ""

    def test_list_orders_by_updated_at_desc(self, client: TestClient) -> None:
        _create_thread(client, title="Older")
        newer = _create_thread(client, title="Newer")
        body = client.get("/api/v1/chat/threads").json()
        assert body["total"] == 2
        # First item is the most-recently-updated thread.
        assert body["items"][0]["id"] == newer["id"]
        assert body["items"][0]["title"] == "Newer"

    def test_list_supports_pagination(self, client: TestClient) -> None:
        for i in range(3):
            _create_thread(client, title=f"T{i}")
        body = client.get("/api/v1/chat/threads", params={"page": 1, "page_size": 2}).json()
        assert body["total"] == 3
        assert len(body["items"]) == 2
        assert body["page"] == 1
        assert body["page_size"] == 2

    def test_get_returns_404_for_unknown(self, client: TestClient) -> None:
        response = client.get("/api/v1/chat/threads/does-not-exist")
        assert response.status_code == 404
        assert "Chat thread not found" in response.json()["detail"]

    def test_get_returns_messages(self, client: TestClient) -> None:
        thread = _create_thread(client, title="With messages")
        client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={"role": "user", "content": "Hola"},
        )
        client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={
                "role": "assistant",
                "content": "Hola de vuelta",
                "payload": {"sources": [{"law": "BOE", "article": "1"}]},
            },
        )
        body = client.get(f"/api/v1/chat/threads/{thread['id']}").json()
        assert len(body["messages"]) == 2
        assert body["messages"][0]["role"] == "user"
        assert body["messages"][0]["content"] == "Hola"
        assert body["messages"][1]["role"] == "assistant"
        assert body["messages"][1]["payload"] == {"sources": [{"law": "BOE", "article": "1"}]}

    def test_patch_renames_thread(self, client: TestClient) -> None:
        thread = _create_thread(client, title="Old")
        response = client.patch(
            f"/api/v1/chat/threads/{thread['id']}",
            json={"title": "Renamed"},
        )
        assert response.status_code == 200
        assert response.json()["title"] == "Renamed"

    def test_patch_404_for_unknown(self, client: TestClient) -> None:
        response = client.patch("/api/v1/chat/threads/missing", json={"title": "X"})
        assert response.status_code == 404

    def test_patch_400_on_empty_body(self, client: TestClient) -> None:
        """Sprint 6 api-9: empty patches used to silently bump
        ``updated_at``. Now refused with 400 + stable code so the SPA
        knows to stop sending empty bodies.
        """
        thread = _create_thread(client, title="Untouched")
        response = client.patch(
            f"/api/v1/chat/threads/{thread['id']}",
            json={},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "empty_patch"

    def test_delete_removes_thread_and_messages(self, client: TestClient) -> None:
        thread = _create_thread(client, title="Doomed")
        client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={"role": "user", "content": "Hola"},
        )
        delete_response = client.delete(f"/api/v1/chat/threads/{thread['id']}")
        assert delete_response.status_code == 204
        assert client.get(f"/api/v1/chat/threads/{thread['id']}").status_code == 404
        # Listing no longer surfaces the thread.
        listing = client.get("/api/v1/chat/threads").json()
        assert listing["total"] == 0

    def test_delete_is_idempotent(self, client: TestClient) -> None:
        """Sprint 5 api-3 — RFC 7231 mandates that DELETE be idempotent.

        Repeated calls converge on 204 regardless of whether the row
        ever existed. Previously the endpoint returned 404 on second
        call, which broke retries for clients that lose track of state.
        """
        thread = _create_thread(client, title="Doomed-idem")
        first = client.delete(f"/api/v1/chat/threads/{thread['id']}")
        assert first.status_code == 204
        second = client.delete(f"/api/v1/chat/threads/{thread['id']}")
        assert second.status_code == 204
        # Deleting a thread that never existed also returns 204.
        unknown = client.delete("/api/v1/chat/threads/missing-id-xyz")
        assert unknown.status_code == 204


class TestMessages:
    def test_append_message_returns_persisted_row(self, client: TestClient) -> None:
        thread = _create_thread(client, title="t")
        response = client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={"role": "user", "content": "Hola"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["role"] == "user"
        assert body["content"] == "Hola"
        assert body["thread_id"] == thread["id"]
        assert body["created_at"]
        assert body["payload"] is None

    def test_append_message_404_for_unknown_thread(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/chat/threads/missing/messages",
            json={"role": "user", "content": "Hola"},
        )
        assert response.status_code == 404

    def test_append_rejects_empty_content(self, client: TestClient) -> None:
        thread = _create_thread(client)
        response = client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={"role": "user", "content": ""},
        )
        assert response.status_code == 422

    def test_preview_uses_latest_message(self, client: TestClient) -> None:
        thread = _create_thread(client, title="t")
        client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={"role": "user", "content": "first"},
        )
        client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={"role": "assistant", "content": "second — most recent"},
        )
        listing = client.get("/api/v1/chat/threads").json()
        assert listing["items"][0]["preview"] == "second — most recent"

    def test_preview_truncates_long_content(self, client: TestClient) -> None:
        thread = _create_thread(client, title="t")
        long_text = "x" * 500
        client.post(
            f"/api/v1/chat/threads/{thread['id']}/messages",
            json={"role": "user", "content": long_text},
        )
        listing = client.get("/api/v1/chat/threads").json()
        preview = listing["items"][0]["preview"]
        assert preview is not None
        assert preview.endswith("…")
        assert len(preview) <= 140
