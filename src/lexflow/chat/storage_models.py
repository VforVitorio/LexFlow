"""SQLModel tables for chat thread persistence (issue #83).

Two tables only:

* ``chat_threads``   — one row per conversation.
* ``chat_messages``  — one row per turn, child of a thread.

We keep ``payload_json`` on messages as a free-form string column for
assistant sources, tool-call args, etc. — the schema evolves often as the
chat surface grows, and a typed sub-table per message kind would cost
more migrations than it's worth at this stage. The API layer
(:mod:`lexflow.api.routers.chat_threads`) is the one that knows how to
parse / serialise the payload.

NOTE: this module intentionally does NOT use ``from __future__ import
annotations``. SQLModel's ``Relationship`` introspects annotations at
class-body evaluation time and chokes on PEP-563 deferred strings; the
plain-runtime annotations below let it wire ``ChatThread.messages`` to
``ChatMessage`` without surprises.

--- WHERE TO CHANGE IF X CHANGES ---
* New message kind / field    → update payload conventions in
                                ``lexflow.chat.schemas`` and the
                                router's serialiser.
* Schema breaking change      → add a migration (we don't have Alembic
                                yet; ``create_all`` is fine until we ship
                                a real release).
"""

import uuid
from datetime import UTC, datetime

from sqlmodel import Field, Relationship, SQLModel


def _new_id() -> str:
    """Stable id factory. Hex string so it's URL-safe and short."""
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    """Naive timezone-aware UTC stamp. SQLite stores as ISO string."""
    return datetime.now(UTC)


class ChatThread(SQLModel, table=True):
    """One chat conversation."""

    __tablename__ = "chat_threads"

    id: str = Field(default_factory=_new_id, primary_key=True)
    title: str = Field(default="Nueva conversación", index=True)
    # `model` is the user's chosen model id (e.g. "openai:gpt-4o"). Stored
    # so re-opening a thread keeps the same provider/model — but the user
    # can flip it on a per-message basis.
    model: str = Field(default="")
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow, index=True)

    # NOTE: bare ``list["ChatMessage"]`` — see module docstring on why
    # this module avoids ``from __future__ import annotations``. The
    # quoted forward reference is required because ChatMessage is
    # defined below; SQLModel resolves it once both classes are
    # registered.
    messages: list["ChatMessage"] = Relationship(
        back_populates="thread",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "ChatMessage.created_at"},
    )


class ChatMessage(SQLModel, table=True):
    """One turn inside a thread.

    ``role`` is "user" | "assistant" | "tool" | "system". The free-form
    ``payload_json`` column carries extra structured data per role:

    * assistant  → ``{"sources": [...], "blocks": [...]}``
    * tool       → ``{"name": "...", "args": {...}, "result": "..."}``
    """

    __tablename__ = "chat_messages"

    id: str = Field(default_factory=_new_id, primary_key=True)
    thread_id: str = Field(foreign_key="chat_threads.id", index=True)
    role: str = Field(index=True)
    content: str = Field(default="")
    created_at: datetime = Field(default_factory=_utcnow, index=True)
    payload_json: str | None = Field(default=None)

    thread: ChatThread | None = Relationship(back_populates="messages")
