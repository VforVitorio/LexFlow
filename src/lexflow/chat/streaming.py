"""SSE streaming for chat replies (issue #84).

Implements the streaming substrate behind
``POST /api/v1/chat/threads/{id}/send``:

1. Resolve the model id (``"openai:gpt-4o"``) to a concrete
   :class:`ChatProvider`.
2. Build the full message history for the thread (DB + the new user
   turn) so the model has context.
3. Call ``provider.stream_chat()`` and forward each text chunk to the
   client as an SSE ``text`` event.
4. On stream completion, persist the assistant turn so the next request
   sees it.

The MCP tool-use loop (``tool_call`` and ``source`` events) lives in a
follow-up issue — the :class:`ChatProvider` interface doesn't expose
tool calls yet, so this PR only emits ``text``, ``error`` and ``done``
events. The wire format is forward-compatible: clients that already
handle ``tool_call`` / ``source`` will keep working once those land.

--- WHERE TO CHANGE IF X CHANGES ---
* New event type            → add a constant in :class:`SseEvent` and
                              a producer below.
* New provider key          → register it in :func:`_provider_for`.
* Persistence shape changes → ``lexflow.chat.storage_models`` and
                              ``lexflow.chat.schemas``.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session

from lexflow.chat import provider_registry
from lexflow.chat.base import ChatMessage as ProviderMessage
from lexflow.chat.base import ChatProvider, ChatProviderError
from lexflow.chat.storage_models import ChatMessage, ChatThread

logger = logging.getLogger(__name__)


class SseEvent:
    """Canonical SSE event names emitted by this module.

    Centralised so the React client and the backend agree on the wire
    vocabulary. Adding a new event here is the right place to start
    (tool_call / source live here pending the MCP loop).
    """

    TEXT = "text"
    TOOL_CALL = "tool_call"
    SOURCE = "source"
    ERROR = "error"
    DONE = "done"


class UnknownProviderError(ValueError):
    """Raised when the ``provider:model`` id has an unknown provider key."""


def split_model_id(model_id: str) -> tuple[str, str]:
    """Split ``"openai:gpt-4o"`` → ``("openai", "gpt-4o")``.

    Raises :class:`UnknownProviderError` for malformed input. Model
    names themselves may contain colons (e.g. ``"llama3.1:8b"``), so we
    only split on the first one.
    """
    if ":" not in model_id:
        raise UnknownProviderError(f"Model id must be 'provider:model', got: {model_id!r}")
    provider_key, _, model_name = model_id.partition(":")
    if not provider_key or not model_name:
        raise UnknownProviderError(f"Model id must be 'provider:model', got: {model_id!r}")
    return provider_key, model_name


def _provider_for(provider_key: str) -> ChatProvider:
    """Instantiate the chat provider matching ``provider_key``.

    Reads from the shared registry through a module attribute so tests
    that monkeypatch ``provider_registry.PROVIDERS_BY_KEY`` reach this
    layer without a separate patch site.
    """
    spec = provider_registry.PROVIDERS_BY_KEY.get(provider_key)
    if spec is None:
        raise UnknownProviderError(f"Unknown chat provider: {provider_key!r}")
    return spec.factory()


def format_sse(event: str, data: Any) -> str:
    """Render one SSE event as a wire-format string.

    ``data`` is JSON-encoded. Multi-line payloads would be a parse hazard
    on the client side, so we always emit a single ``data:`` line —
    EventSource handles single-line JSON cleanly.
    """
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


def _thread_history(thread: ChatThread) -> list[ProviderMessage]:
    """Convert a thread's persisted messages to provider input.

    Tool messages are skipped — the providers don't accept them as raw
    turns; their content will be reconstructed via the MCP loop in the
    follow-up issue.
    """
    messages: list[ProviderMessage] = []
    for stored in thread.messages:
        if stored.role not in {"user", "assistant", "system"}:
            continue
        messages.append(ProviderMessage(role=stored.role, content=stored.content))
    return messages


async def stream_chat_reply(
    *,
    session: Session,
    thread: ChatThread,
    user_message_content: str,
    model_id: str,
) -> AsyncIterator[str]:
    """Async generator yielding SSE-formatted strings for one turn.

    The generator's contract:

    * Always starts by persisting the user turn (so reconnects / failures
      after this point still leave the message in the thread).
    * Emits one ``text`` event per provider chunk.
    * On clean completion, persists the assistant turn and emits
      ``done``.
    * On provider failure mid-stream, emits ``error`` and ``done`` but
      still persists whatever assistant content was received — partial
      replies are better than data loss.

    Mounting in a FastAPI handler: wrap in ``StreamingResponse(...,
    media_type="text/event-stream")``.
    """
    # 1. Persist the user turn first so a crash during streaming doesn't
    #    swallow the user's question.
    user_message = ChatMessage(
        thread_id=thread.id,
        role="user",
        content=user_message_content,
    )
    session.add(user_message)
    # Don't bump updated_at yet — the assistant turn will, and we want
    # the thread to surface in the rail under the latest activity.
    session.commit()

    # 2. Resolve provider + assemble context.
    try:
        provider_key, model_name = split_model_id(model_id)
        provider = _provider_for(provider_key)
    except UnknownProviderError as exc:
        yield format_sse(SseEvent.ERROR, {"detail": str(exc)})
        yield format_sse(SseEvent.DONE, {})
        return

    # Refresh so the in-session ``user_message`` shows up in history.
    session.refresh(thread)
    history = _thread_history(thread)

    # 3. Stream. Accumulate chunks so we can persist the full reply at
    #    the end.
    assistant_chunks: list[str] = []
    try:
        async for chunk in provider.stream_chat(history, model_name):
            if not chunk:
                continue
            assistant_chunks.append(chunk)
            yield format_sse(SseEvent.TEXT, {"delta": chunk})
    except ChatProviderError as exc:
        # Both `provider_key` (from `split_model_id(body.model)`) and
        # `exc` (built by the provider wrapping the original SDK error)
        # are user-influenced. CodeQL's py/log-injection query does NOT
        # recognise the `%r` format spec as a sanitiser even though it
        # invokes `repr()` at runtime (alerts #3, #4, #5 all surfaced on
        # successive `%r` attempts). Explicit `repr()` calls match the
        # query's sanitiser pattern, so we use those instead — same
        # bytes on the wire, different static-analysis signal.
        logger.info(
            "Provider %s stream failed: %s",
            repr(provider_key),
            repr(exc),
        )
        # ``str(exc)`` of a ChatProviderError is the message we constructed
        # ourselves (e.g. "OpenAI rate limit exceeded"); intentional to
        # surface so the user knows whether to retry vs reauth.
        yield format_sse(SseEvent.ERROR, {"detail": str(exc)})
    except Exception:
        # Generic exception path: the message can carry stack-frame
        # context (file paths, internal SQL, model names). Log the full
        # trace on the server side and emit a generic detail to the
        # client (CodeQL alert #2 — py/stack-trace-exposure).
        logger.exception("Unexpected error during chat stream")
        yield format_sse(SseEvent.ERROR, {"detail": "Internal error during chat stream"})

    # 4. Persist whatever we got. Empty replies still get a row so the
    #    UI doesn't render a "ghost turn"; the assistant row's empty
    #    content tells the rail "nothing to show here".
    assistant_content = "".join(assistant_chunks)
    assistant_message = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=assistant_content,
    )
    session.add(assistant_message)
    thread.updated_at = datetime.now(UTC)
    session.add(thread)
    session.commit()

    yield format_sse(SseEvent.DONE, {})
