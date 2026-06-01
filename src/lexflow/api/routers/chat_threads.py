"""``/api/v1/chat/threads`` — CRUD for persisted chat threads (issue #83).

Five endpoints:

* ``GET    /chat/threads``               — paginated listing
* ``POST   /chat/threads``               — create
* ``GET    /chat/threads/{id}``          — detail + message history
* ``PATCH  /chat/threads/{id}``          — rename
* ``DELETE /chat/threads/{id}``          — delete
* ``POST   /chat/threads/{id}/messages`` — append a turn (used by tests
                                            today, by the streaming
                                            endpoint in #84 tomorrow)

Persistence is SQLite via :mod:`lexflow.chat.db`.

--- WHERE TO CHANGE IF X CHANGES ---
* Schema    →  ``lexflow.chat.schemas`` (ChatThreadRead, ChatMessageRead).
* Storage   →  ``lexflow.chat.storage_models`` (SQLModel tables).
* Streaming →  issue #84 will add ``POST /chat/threads/{id}/send`` that
               returns an SSE stream and writes the assistant turn here
               on completion.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlmodel import Session, func, select

from lexflow.chat.db import get_session
from lexflow.chat.schemas import (
    ChatMessageCreate,
    ChatMessageRead,
    ChatSendRequest,
    ChatThreadCreate,
    ChatThreadDetail,
    ChatThreadList,
    ChatThreadPatch,
    ChatThreadRead,
)
from lexflow.chat.storage_models import ChatMessage, ChatThread
from lexflow.chat.streaming import stream_chat_reply

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])

_PREVIEW_MAX_CHARS = 140


# ---------------------------------------------------------------------------
# Helpers — keep route handlers thin
# ---------------------------------------------------------------------------


def _load_thread_or_404(session: Session, thread_id: str) -> ChatThread:
    """Fetch a thread row by id or raise FastAPI's 404."""
    thread = session.get(ChatThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail=f"Chat thread not found: {thread_id}")
    return thread


def _decode_payload(raw: str | None) -> dict[str, Any] | None:
    """JSON-decode a payload column, returning ``None`` on absence/error.

    Bad rows are logged at WARNING and surfaced as ``None`` — we don't
    want one corrupted row to brick a whole thread listing.
    """
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Chat message payload is not valid JSON; surfacing None")
        return None
    if isinstance(value, dict):
        return value
    return None


def _encode_payload(payload: dict[str, Any] | None) -> str | None:
    """JSON-encode the payload field, or ``None`` if absent."""
    if payload is None:
        return None
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def _message_read(message: ChatMessage) -> ChatMessageRead:
    """Map a storage row to the API response shape."""
    return ChatMessageRead(
        id=message.id,
        thread_id=message.thread_id,
        # Pydantic narrows ``str`` to the ``ChatRole`` literal at parse
        # time — invalid roles would already have failed at insert.
        role=message.role,
        content=message.content,
        created_at=message.created_at,
        payload=_decode_payload(message.payload_json),
    )


def _latest_preview(session: Session, thread_id: str) -> str | None:
    """Pick the most recent message's content as a thread preview.

    Trimmed to ``_PREVIEW_MAX_CHARS`` chars so the conversation rail
    doesn't have to do its own ellipsising.
    """
    statement = (
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        # SQLModel re-binds ``created_at`` to an ORM descriptor at runtime,
        # but mypy only sees the declared ``datetime`` type — hence the
        # explicit ignore. Same pattern used in ``list_threads`` below.
        .order_by(_newest_first(ChatMessage.created_at))
        .limit(1)
    )
    msg = session.exec(statement).first()
    if msg is None or not msg.content:
        return None
    text = msg.content.strip()
    if len(text) <= _PREVIEW_MAX_CHARS:
        return text
    return text[: _PREVIEW_MAX_CHARS - 1].rstrip() + "…"


def _thread_read(session: Session, thread: ChatThread) -> ChatThreadRead:
    """Map a storage row to the API listing shape, including preview."""
    return ChatThreadRead(
        id=thread.id,
        title=thread.title,
        model=thread.model,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        preview=_latest_preview(session, thread.id),
    )


def _touch_thread(thread: ChatThread) -> None:
    """Bump ``updated_at`` so the conversation rail reorders correctly."""
    thread.updated_at = datetime.now(UTC)


def _newest_first(column: Any) -> Any:
    """Typed wrapper around SQLAlchemy ``desc()`` (Sprint 7 rf-10).

    SQLModel re-binds columns to ORM descriptors at runtime, but mypy
    sees the declared static type and complains about
    ``desc(SomeModel.created_at)``. Isolating the suppression here keeps
    the call sites readable.
    """
    return desc(column)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/threads",
    response_model=ChatThreadList,
    summary="List chat threads, newest activity first.",
)
def list_threads(
    session: Annotated[Session, Depends(get_session)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ChatThreadList:
    """Paginated list of threads ordered by ``updated_at`` desc."""
    total = session.exec(select(func.count()).select_from(ChatThread)).one()
    statement = (
        select(ChatThread)
        # See note on ``_latest_preview`` — runtime descriptor vs static type.
        .order_by(_newest_first(ChatThread.updated_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = session.exec(statement).all()
    return ChatThreadList(
        items=[_thread_read(session, t) for t in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/threads",
    response_model=ChatThreadRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat thread.",
)
def create_thread(
    body: ChatThreadCreate,
    session: Annotated[Session, Depends(get_session)],
) -> ChatThreadRead:
    """Insert a new thread and return its read shape."""
    thread = ChatThread(
        title=body.title or "Nueva conversación",
        model=body.model or "",
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
    return _thread_read(session, thread)


@router.get(
    "/threads/{thread_id}",
    response_model=ChatThreadDetail,
    summary="Read a thread plus its full message history.",
)
def get_thread(
    thread_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> ChatThreadDetail:
    """404 if the id is unknown."""
    thread = _load_thread_or_404(session, thread_id)
    base = _thread_read(session, thread)
    return ChatThreadDetail(
        **base.model_dump(),
        messages=[_message_read(m) for m in thread.messages],
    )


@router.patch(
    "/threads/{thread_id}",
    response_model=ChatThreadRead,
    summary="Rename a thread (only ``title`` is patchable today).",
)
def patch_thread(
    thread_id: str,
    body: ChatThreadPatch,
    session: Annotated[Session, Depends(get_session)],
) -> ChatThreadRead:
    """Apply non-null fields from the body and return the updated row.

    Sprint 6 api-9: an empty patch (every field None) used to silently
    succeed and bump ``updated_at`` — a no-op write that confused list
    ordering. Now refused with 400 so the client knows to stop sending
    empty bodies.
    """
    thread = _load_thread_or_404(session, thread_id)
    if body.title is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "empty_patch", "message": "Provide at least one patchable field."},
        )
    thread.title = body.title
    _touch_thread(thread)
    session.add(thread)
    session.commit()
    session.refresh(thread)
    return _thread_read(session, thread)


@router.delete(
    "/threads/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a thread and all its messages (cascade). Idempotent.",
)
def delete_thread(
    thread_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    """Fully idempotent per RFC 7231 (Sprint 5 api-3): repeated calls
    converge on 204 regardless of whether the row existed. Cascade on
    ``ChatThread.messages`` cleans up child rows."""
    thread = session.get(ChatThread, thread_id)
    if thread is None:
        return
    session.delete(thread)
    session.commit()


@router.post(
    "/threads/{thread_id}/messages",
    response_model=ChatMessageRead,
    status_code=status.HTTP_201_CREATED,
    summary="Append one message to a thread. Streaming send lives in #84.",
)
def append_message(
    thread_id: str,
    body: ChatMessageCreate,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> ChatMessageRead:
    """Append a turn, touch the thread's ``updated_at`` and return the
    persisted row. Intentionally non-streaming — see issue #84 for the
    SSE counterpart that adds the assistant + tool turns.

    Sprint 6 api-5: emits ``Location: /api/v1/chat/threads/{thread_id}/
    messages/{message_id}`` per RFC 7231 for 201 responses. There is no
    GET endpoint for an individual message today (the SPA reads them
    nested under the thread), but the header is correct and lets a
    future client distinguish the new row from the thread's full list.
    """
    thread = _load_thread_or_404(session, thread_id)
    message = ChatMessage(
        thread_id=thread.id,
        role=body.role,
        content=body.content,
        payload_json=_encode_payload(body.payload),
    )
    session.add(message)
    _touch_thread(thread)
    session.add(thread)
    session.commit()
    session.refresh(message)
    response.headers["Location"] = f"/api/v1/chat/threads/{thread.id}/messages/{message.id}"
    return _message_read(message)


@router.post(
    "/threads/{thread_id}/send",
    status_code=status.HTTP_200_OK,
    summary="Stream an assistant reply for the user message (SSE).",
    responses={
        200: {
            "description": "Server-sent events stream.",
            "content": {"text/event-stream": {}},
        },
        404: {"description": "Thread not found — emitted BEFORE the stream opens."},
    },
)
async def send_message_stream(
    thread_id: str,
    body: ChatSendRequest,
    session: Annotated[Session, Depends(get_session)],
) -> StreamingResponse:
    """Persist the user turn, then stream the assistant reply as SSE.

    Wire format (one event per record, blank line terminator):

    ::

        event: text
        data: {"delta": "Hola "}

        event: text
        data: {"delta": "mundo."}

        event: done
        data: {}

    On provider error we emit ``event: error`` with a ``detail`` field
    before the final ``done``. Partial assistant replies are persisted —
    a dropped connection leaves the thread with whatever streamed
    through. See :mod:`lexflow.chat.streaming` for the generator.

    The MCP tool-use loop (``tool_call`` / ``source`` events) is tracked
    as a follow-up issue; the wire format is forward-compatible so
    clients that already render those event types keep working.
    """
    thread = _load_thread_or_404(session, thread_id)
    # ``stream_chat_reply`` consumes the session — once the generator is
    # entered we cannot reuse it for the response body. The dependency
    # already opens a fresh session per request, so FastAPI closes it
    # cleanly when the streaming response finishes.
    generator = stream_chat_reply(
        session=session,
        thread=thread,
        user_message_content=body.message,
        model_id=body.model,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            # Disable response buffering on reverse proxies (nginx etc.)
            # so chunks reach the client immediately.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
