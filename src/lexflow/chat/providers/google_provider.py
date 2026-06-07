"""Google Gemini chat provider for LexFlow."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any

from google import genai

from lexflow.chat.base import (
    ChatMessage,
    ChatProvider,
    ChatProviderError,
    FinishChunk,
    StreamChunk,
    TextChunk,
    ToolCallChunk,
    ToolSpec,
)
from lexflow.chat.secrets import get_api_key

_GOOGLE_MODELS: list[str] = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
]

_ROLE_MAP: dict[str, str] = {
    "user": "user",
    "assistant": "model",
    "system": "user",  # Google does not have a dedicated system role; prepend as user turn
}


class GoogleProvider(ChatProvider):
    """Chat provider backed by the Google Gemini API."""

    def __init__(self, api_key: str | None = None) -> None:
        # Key resolution: explicit arg → env var → OS keyring. See
        # ``chat/secrets.py`` for the full contract.
        resolved_key = api_key or get_api_key("google")
        self._client = genai.Client(api_key=resolved_key)

    async def list_models(self) -> list[str]:
        """Return the list of supported Google Gemini model IDs."""
        return list(_GOOGLE_MODELS)

    async def stream_chat(
        self,
        messages: list[ChatMessage],
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completions from Google Gemini, yielding text chunks."""
        contents = _contents_payload(messages)

        try:
            async for chunk in await self._client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
            ):
                if chunk.text:
                    yield chunk.text
        except Exception as exc:
            # Audit #409: Gemini SDK errors can include the API key in
            # the URL portion of the message. Static client-facing
            # message; original ``exc`` preserved as ``__cause__`` for
            # server-side logging.
            raise ChatProviderError("Google Gemini error") from exc

    async def stream_chat_typed(
        self,
        messages: list[ChatMessage],
        model: str,
        tools: list[ToolSpec] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Native function-calling streaming for the Gemini API.

        Gemini streams content as ``Candidate.content.parts``; each part
        is either a ``text`` blob or a ``function_call`` with an already-
        parsed ``args`` dict. Unlike OpenAI/Anthropic the SDK accumulates
        the JSON arguments for us, so we can forward the call as soon as
        a function-call part lands.

        --- WHERE TO CHANGE IF X CHANGES ---
        * Function-call wire     → ``google.genai.types`` Part shape.
        * Tool payload format    → ``_tools_payload`` (Gemini wraps
          function declarations under a ``Tool`` object).
        * History adaptation     → ``_contents_payload`` (tool turns
          become a ``function`` role with ``function_response`` part).
        """
        contents = _contents_payload(messages)
        kwargs: dict[str, Any] = {"model": model, "contents": contents}
        if tools:
            kwargs["config"] = {"tools": _tools_payload(tools)}

        try:
            tool_calls: list[ToolCallChunk] = []
            finish_reason: str | None = None
            async for chunk in await self._client.aio.models.generate_content_stream(**kwargs):
                candidates = chunk.candidates or []
                if not candidates:
                    continue
                candidate = candidates[0]
                fr = getattr(candidate, "finish_reason", None)
                if fr is not None:
                    # SDK may give an enum or a string — normalise to str.
                    finish_reason = getattr(fr, "name", None) or str(fr)
                content = getattr(candidate, "content", None)
                if content is None:
                    continue
                for part in getattr(content, "parts", None) or []:
                    text = getattr(part, "text", None)
                    if text:
                        yield TextChunk(delta=text)
                        continue
                    fn_call = getattr(part, "function_call", None)
                    if fn_call is not None:
                        name = getattr(fn_call, "name", "") or ""
                        args = getattr(fn_call, "args", None) or {}
                        tool_calls.append(
                            ToolCallChunk(
                                call_id=name,
                                name=name,
                                arguments=_normalise_args(args),
                            )
                        )

            for call in tool_calls:
                yield call
            yield FinishChunk(reason=_translate_finish(finish_reason, has_calls=bool(tool_calls)))
        except Exception as exc:
            raise ChatProviderError("Google Gemini error") from exc


def _contents_payload(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    """Adapt ``ChatMessage`` list to Gemini's ``contents`` shape.

    Tool turns become ``function`` role messages carrying a
    ``function_response`` part with the tool's name + result. Other
    roles map through ``_ROLE_MAP`` and carry a single text part.
    """
    out: list[dict[str, Any]] = []
    for msg in messages:
        if msg.role == "tool":
            response: Any
            try:
                response = json.loads(msg.content)
            except json.JSONDecodeError:
                response = {"result": msg.content}
            if not isinstance(response, dict):
                response = {"result": response}
            out.append(
                {
                    "role": "function",
                    "parts": [
                        {
                            "function_response": {
                                "name": msg.name or msg.tool_call_id or "tool",
                                "response": response,
                            }
                        }
                    ],
                }
            )
            continue
        role = _ROLE_MAP.get(msg.role, "user")
        out.append({"role": role, "parts": [{"text": msg.content}]})
    return out


def _tools_payload(tools: list[ToolSpec]) -> list[dict[str, Any]]:
    """Convert ``ToolSpec`` list to the Gemini tool definition shape."""
    declarations = [
        {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
        }
        for tool in tools
    ]
    return [{"function_declarations": declarations}]


def _normalise_args(args: Any) -> dict[str, Any]:
    """Coerce the SDK's ``args`` value into a plain dict.

    The SDK may hand us a ``Mapping`` view; ``dict(args)`` is enough to
    detach a hashable snapshot the dispatcher can pass through.
    """
    if args is None:
        return {}
    if isinstance(args, dict):
        return dict(args)
    try:
        return dict(args)
    except (TypeError, ValueError):
        return {}


def _translate_finish(reason: str | None, *, has_calls: bool) -> str:
    """Translate a Gemini finish reason into the LexFlow vocabulary."""
    if has_calls:
        return "tool_use"
    if reason is None:
        return "stop"
    upper = reason.upper()
    if upper in {"STOP", "FINISH_REASON_STOP"}:
        return "stop"
    if upper in {"MAX_TOKENS", "FINISH_REASON_MAX_TOKENS"}:
        return "length"
    return "error"
