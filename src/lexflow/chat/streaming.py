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

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session

from lexflow.chat import provider_registry
from lexflow.chat.base import ChatMessage as ProviderMessage
from lexflow.chat.base import (
    ChatProvider,
    ChatProviderError,
    FinishChunk,
    TextChunk,
    ToolCallChunk,
    ToolSpec,
)
from lexflow.chat.mcp_server import TOOL_SPECS, dispatch_tool
from lexflow.chat.storage_models import ChatMessage, ChatThread

# Hard cap on the agentic loop (#195). Once hit, we stop iterating even
# if the model keeps asking for more tool calls — runaway loops would
# pin the server + burn cloud quota.
_MAX_TOOL_ITERATIONS = 5

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


def _extract_citations(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Pull law/article citations out of an MCP tool result (#195).

    Handles three shapes the tools emit today:

    * ``search_law`` → ``{"items": [{"law_id", "article_number", ...}, ...]}``
    * ``get_law``    → ``{"metadata": {"identifier": "BOE-..."} , ...}``
    * ``get_article``→ a single article (``{"number": "1", ...}``) — too
      thin on its own; left out for now.

    Each surfaced citation has ``law_id`` (always) and ``article_number``
    (optional). The frontend already renders these on the ``source``
    SSE event into clickable badges.
    """
    citations: list[dict[str, Any]] = []
    items = result.get("items") if isinstance(result, dict) else None
    if isinstance(items, list):
        for hit in items:
            if not isinstance(hit, dict):
                continue
            law_id = hit.get("law_id")
            if isinstance(law_id, str) and law_id:
                citation: dict[str, Any] = {"law_id": law_id}
                article = hit.get("article_number")
                if isinstance(article, str) and article:
                    citation["article_number"] = article
                citations.append(citation)
    metadata = result.get("metadata") if isinstance(result, dict) else None
    if isinstance(metadata, dict):
        identifier = metadata.get("identifier")
        if isinstance(identifier, str) and identifier:
            citations.append({"law_id": identifier})
    return citations


def _persist_user_turn(session: Session, thread: ChatThread, content: str) -> None:
    """Save the user turn before any streaming starts.

    Persisting first means a stream crash never swallows the user's
    question. We commit but deliberately do NOT bump ``thread.updated_at``
    yet — the assistant turn will, so the thread surfaces in the chat
    rail under the latest activity.
    """
    user_message = ChatMessage(
        thread_id=thread.id,
        role="user",
        content=content,
    )
    session.add(user_message)
    session.commit()


def _persist_assistant_turn(session: Session, thread: ChatThread, content: str) -> None:
    """Save the assistant turn and bump the thread's activity timestamp.

    Empty replies still get a row so the UI doesn't render a "ghost
    turn"; the empty content tells the rail "nothing to show here".
    """
    assistant_message = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=content,
    )
    session.add(assistant_message)
    thread.updated_at = datetime.now(UTC)
    session.add(thread)
    session.commit()


def _run_tool_call(call: ToolCallChunk) -> dict[str, Any]:
    """Dispatch one MCP tool call and wrap failures into a result payload.

    The agentic loop must keep flowing even when a tool blows up — the
    model can apologise / retry. ``KeyError`` from a missing tool maps
    to ``{"error": "unknown_tool", ...}``; any other exception to
    ``{"error": "tool_error", "detail": ...}``. The full stack trace is
    logged on the server, never surfaced to the client.
    """
    try:
        return dispatch_tool(call.name, call.arguments)
    except KeyError:
        return {"error": "unknown_tool", "name": call.name}
    except Exception as exc:
        # The agentic loop must absorb tool failures — a single buggy tool
        # shouldn't kill the user-facing stream. Log the full trace
        # server-side, surface a generic error result the model can
        # apologise / retry on.
        logger.exception("Tool %s failed during agentic loop", repr(call.name))
        return {"error": "tool_error", "detail": str(exc)}


def _record_tool_outcome(
    history: list[ProviderMessage],
    call: ToolCallChunk,
    result: dict[str, Any],
) -> None:
    """Append a ``tool`` message describing *call*'s outcome to *history*.

    The provider re-reads this on the next iteration of the agentic
    loop to decide whether it needs more tool calls or can answer.
    """
    history.append(
        ProviderMessage(
            role="tool",
            content=json.dumps(result, ensure_ascii=False, default=str),
            tool_call_id=call.call_id,
            name=call.name,
        )
    )


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
    _persist_user_turn(session, thread, user_message_content)

    # 2. Resolve provider + assemble context.
    try:
        provider_key, model_name = split_model_id(model_id)
        provider = _provider_for(provider_key)
    except UnknownProviderError as exc:
        yield format_sse(SseEvent.ERROR, {"detail": str(exc)})
        yield format_sse(SseEvent.DONE, {})
        return

    # Refresh so the freshly persisted user turn shows up in history.
    session.refresh(thread)
    history = _thread_history(thread)

    # 3. Stream. The agentic loop (#195) iterates ``stream_chat_typed``
    #    up to ``_MAX_TOOL_ITERATIONS`` times: each iteration either
    #    finishes with text (``stop`` → break) or with tool calls
    #    (``tool_use`` → dispatch + feed result back). Text deltas are
    #    accumulated so the assistant turn can be persisted whole at the
    #    end. Providers that haven't been upgraded to native tool-use
    #    yet fall back to ``stream_chat`` via the default
    #    ``stream_chat_typed`` impl on ``ChatProvider`` — behaves
    #    identically to the pre-#195 path (one iteration, text only).
    assistant_chunks: list[str] = []
    tools = [ToolSpec(**spec) for spec in TOOL_SPECS]

    def _is_tools_unsupported(error: ChatProviderError) -> bool:
        """True when the provider rejected the request *because* of tools.

        Small local models (gemma, many <7B) don't implement function
        calling, so Ollama answers 400 "does not support tools". We retry
        once without tools so the user still gets a (RAG-less) reply
        instead of an empty turn (#564).
        """
        msg = str(error).lower()
        return "does not support tools" in msg or ("tool" in msg and "not support" in msg)

    # Agentic loop with a one-shot degrade: the first attempt carries the
    # RAG tools; if the model can't do tool-use we retry once with none so
    # tool-incapable models still answer (without citations) instead of
    # erroring out to an empty turn.
    attempt_tools = tools
    while True:
        retry_without_tools = False
        try:
            for _ in range(_MAX_TOOL_ITERATIONS):
                finish_reason: str | None = None
                pending_calls: list[ToolCallChunk] = []
                async for typed in provider.stream_chat_typed(history, model_name, tools=attempt_tools):
                    if isinstance(typed, TextChunk):
                        if not typed.delta:
                            continue
                        assistant_chunks.append(typed.delta)
                        yield format_sse(SseEvent.TEXT, {"delta": typed.delta})
                    elif isinstance(typed, ToolCallChunk):
                        pending_calls.append(typed)
                        yield format_sse(
                            SseEvent.TOOL_CALL,
                            {"call_id": typed.call_id, "name": typed.name, "args": typed.arguments},
                        )
                    elif isinstance(typed, FinishChunk):
                        finish_reason = typed.reason
                        break
                if not pending_calls or finish_reason == "stop":
                    break
                for call in pending_calls:
                    result = _run_tool_call(call)
                    for citation in _extract_citations(result):
                        yield format_sse(SseEvent.SOURCE, citation)
                    _record_tool_outcome(history, call, result)
        except ChatProviderError as exc:
            if attempt_tools and _is_tools_unsupported(exc):
                # Degrade to a tool-less chat for this turn and start over.
                logger.info("Model %s rejected tools; retrying without tools", repr(model_name))
                assistant_chunks.clear()
                attempt_tools = []
                retry_without_tools = True
            else:
                # Both `provider_key` and `exc` are user-influenced. CodeQL's
                # py/log-injection query doesn't recognise `%r` as a sanitiser
                # even though it calls repr() at runtime, so we use explicit
                # repr() — same bytes, different static-analysis signal.
                logger.info("Provider %s stream failed: %s", repr(provider_key), repr(exc))
                # ``str(exc)`` is the message we constructed ourselves; safe
                # to surface so the user knows whether to retry vs reauth.
                yield format_sse(SseEvent.ERROR, {"detail": str(exc)})
        except asyncio.CancelledError:
            # Sprint 6 rf-5: a CancelledError means the client disconnected
            # (Starlette propagates it through the generator). We must NOT
            # swallow it — the generic `except Exception` below used to, which
            # turned a normal disconnect into a synthetic SSE `error` event
            # that no client could see anyway. Re-raise so the runtime can
            # tear the stream down cleanly.
            raise
        except Exception:
            # Generic exception path: the message can carry stack-frame
            # context (file paths, internal SQL, model names). Log the full
            # trace on the server side and emit a generic detail to the
            # client (CodeQL alert #2 — py/stack-trace-exposure).
            logger.exception("Unexpected error during chat stream")
            yield format_sse(SseEvent.ERROR, {"detail": "Internal error during chat stream"})
        # One-shot retry without tools (see _is_tools_unsupported); any other
        # outcome (success, surfaced error, generic failure) ends the loop.
        if retry_without_tools:
            continue
        break

    # 4. Persist whatever we got. Even an empty reply gets a row so the
    #    UI doesn't render a "ghost turn".
    _persist_assistant_turn(session, thread, "".join(assistant_chunks))

    yield format_sse(SseEvent.DONE, {})
