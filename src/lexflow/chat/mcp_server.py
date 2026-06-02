"""FastMCP server exposing LexFlow legal tools to AI assistants.

Each ``@mcp.tool()`` is wrapped by :func:`_audited` (issue #124, Phase 1)
so every call appends a hash-chained pair of records to
``<config_dir>/mcp.log``:

* ``tool_call_start`` — right before the body runs.
* ``tool_call_end`` — right after it returns or raises, with the outcome
  recorded in the ``lexflow_outcome`` / ``lexflow_error_message``
  extension fields.

Phase 1 auto-allows every call (``Decision.ALLOW`` + ``Classification.SAFE``).
Real policy gating + consent prompts arrive in Phases 2-3.

--- WHERE TO CHANGE IF ANOTHER TOOL LANDS ---
Add the function, decorate with ``@mcp.tool()`` then ``@_audited(name)``
underneath. Decorator order matters: ``_audited`` must run first so the
wrapper is what FastMCP registers.
"""

from __future__ import annotations

import functools
import inspect
import logging
from collections.abc import Callable
from typing import Any, TypeVar

from fastmcp import FastMCP

from lexflow.chat.audit import (
    Decision,
    build_audit_record,
    evaluate,
    get_audit_log,
    make_audit_request,
)
from lexflow.core.exceptions import LawNotFoundError
from lexflow.core.registry import get_registry
from lexflow.core.services import find_article

logger = logging.getLogger(__name__)

mcp: FastMCP = FastMCP("lexflow-legal")

F = TypeVar("F", bound=Callable[..., Any])


def _audited(tool_name: str) -> Callable[[F], F]:
    """Wrap an MCP tool so each invocation emits start/end audit records.

    Sits BETWEEN the FastMCP decorator and the implementation, e.g.::

        @mcp.tool()
        @_audited("search_law")
        def search_law(...): ...

    The lifecycle is (Phase 2, #124):

    1. Bind args to the signature, build the canonical ``args`` dict
       used for ``payload_summary`` + ``target`` derivation.
    2. Run :func:`lexflow.chat.audit.policy.evaluate` against the
       request. The decision is reused for the whole call so the
       start and end records carry the same verdict.
    3. Append a ``tool_call_start`` record (entries are hash-chained,
       so any later tampering also breaks this one).
    4. If the decision is NOT ``ALLOW``, skip the underlying function
       and return a denial dict shaped like the rest of the tool
       error contract. The end record still ships so the chain shows
       the full lifecycle of the refused call.
    5. Otherwise run the underlying function. On success record
       ``lexflow_outcome="success"``; on exception record
       ``"error"`` + truncated message and re-raise.
    """

    def decorator(fn: F) -> F:
        sig = inspect.signature(fn)

        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            args_dict: dict[str, object] = dict(bound.arguments)
            log = get_audit_log()

            request = make_audit_request(tool_name, args_dict)
            decision = evaluate(request)

            start = build_audit_record(
                event_type="tool_call_start",
                tool_name=tool_name,
                args=args_dict,
                decision=decision,
                previous_hash=log.read_last_hash(),
            )
            log.append(start)

            if decision.decision is not Decision.ALLOW:
                # Policy refused — never enter the underlying function.
                # Emit the matching end record so the audit chain
                # captures the full request lifecycle even on denial.
                end = build_audit_record(
                    event_type="tool_call_end",
                    tool_name=tool_name,
                    args=args_dict,
                    decision=decision,
                    previous_hash=log.read_last_hash(),
                    outcome="denied",
                )
                log.append(end)
                return {
                    "error": "policy_denied",
                    "decision": decision.decision.value,
                    "classification": decision.classification.value,
                    "reason": decision.reason,
                }

            try:
                result = fn(*args, **kwargs)
            except Exception as exc:
                end = build_audit_record(
                    event_type="tool_call_end",
                    tool_name=tool_name,
                    args=args_dict,
                    decision=decision,
                    previous_hash=log.read_last_hash(),
                    outcome="error",
                    error_message=str(exc),
                )
                log.append(end)
                raise

            end = build_audit_record(
                event_type="tool_call_end",
                tool_name=tool_name,
                args=args_dict,
                decision=decision,
                previous_hash=log.read_last_hash(),
                outcome="success",
            )
            log.append(end)
            return result

        return wrapper  # type: ignore[return-value]

    return decorator


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
@_audited("search_law")
def search_law(query: str) -> dict:  # type: ignore[type-arg]
    """Search for laws by text query.

    Args:
        query: Free-text search query.

    Returns:
        Paginated search results with law IDs, titles, article numbers and snippets.
    """
    registry = get_registry()
    result = registry.search_text(query, page=1, page_size=10)
    return result.model_dump()


@mcp.tool()
@_audited("get_law")
def get_law(law_id: str) -> dict:  # type: ignore[type-arg]
    """Retrieve the full content of a law by its BOE identifier.

    Args:
        law_id: BOE identifier of the law (e.g. 'BOE-A-1978-31229').

    Returns:
        Full law data including metadata, sections, articles and cross-references.
    """
    registry = get_registry()
    try:
        law = registry.get_law(law_id)
    except LawNotFoundError:
        return {"error": "not_found", "law_id": law_id}
    return law.model_dump()


@mcp.tool()
@_audited("get_article")
def get_article(law_id: str, article_number: str) -> dict:  # type: ignore[type-arg]
    """Retrieve a specific article from a law.

    Args:
        law_id: BOE identifier of the law.
        article_number: Article number string (e.g. '1', '2 bis').

    Returns:
        Article data, or an error dict if the law or article is not found.
    """
    registry = get_registry()
    try:
        law = registry.get_law(law_id)
    except LawNotFoundError:
        return {"error": "not_found", "law_id": law_id}

    article = find_article(law, article_number)
    if article is None:
        return {"error": "article_not_found", "law_id": law_id, "article_number": article_number}
    return article.model_dump()


@mcp.tool()
@_audited("get_stats")
def get_stats() -> dict:  # type: ignore[type-arg]
    """Return aggregate statistics about the LexFlow law registry.

    Returns:
        Dict with total_laws count.
    """
    registry = get_registry()
    return {"total_laws": registry.total_count}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run() -> None:
    """Start the MCP server."""
    mcp.run()


if __name__ == "__main__":
    run()
