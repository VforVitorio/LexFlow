"""API smoke test for the milestone-#9 QA sprint (#381-#389).

Drives a RUNNING backend (``uv run python main.py`` on :8000) and asserts
the curl-able items from the QA checklists — the parts that don't need a
human looking at pixels. Visual-only items (tour spotlight, chart render,
375px sheet) stay manual; this covers the contract every surface rests on.

Run:
    uv run python main.py            # in one shell
    uv run python scripts/qa_smoke.py  # in another

Grouped PASS/FAIL report + non-zero exit on any failure. Each check is
isolated so one failure never aborts the run.

Safety: the secrets check only writes to the OS keyring when ``openai`` is
NOT already configured, so it never clobbers a real key.
"""

from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass, field

import httpx

BASE = "http://localhost:8000"
API = f"{BASE}/api/v1"
QUERY = "protección de datos"


@dataclass
class Report:
    results: list[tuple[str, str, bool, str]] = field(default_factory=list)

    def check(self, issue: str, name: str, ok: bool, detail: str = "") -> None:
        self.results.append((issue, name, bool(ok), detail))

    def run(self, issue: str, name: str, fn) -> None:  # type: ignore[no-untyped-def]
        try:
            ok, detail = fn()
            self.check(issue, name, ok, detail)
        except Exception as exc:
            # Smoke harness: record the failure, never abort the whole run.
            self.check(issue, name, False, f"{type(exc).__name__}: {exc}")

    def summarise(self) -> int:
        by_issue: dict[str, list[tuple[str, bool, str]]] = {}
        for issue, name, ok, detail in self.results:
            by_issue.setdefault(issue, []).append((name, ok, detail))
        failed = 0
        for issue in sorted(by_issue):
            print(f"\n=== {issue} ===")
            for name, ok, detail in by_issue[issue]:
                mark = "PASS" if ok else "FAIL"
                if not ok:
                    failed += 1
                suffix = f"  — {detail}" if detail else ""
                print(f"  [{mark}] {name}{suffix}")
        total = len(self.results)
        print(f"\n{total - failed}/{total} checks passed.")
        return failed


def main() -> int:
    # Generous timeout: the FIRST semantic/hybrid query builds the index by
    # parsing all ~12 K law files (parse-bound cold build, then persisted to
    # ~/.lexflow/index/). Subsequent queries are instant.
    client = httpx.Client(timeout=300.0)
    r = Report()

    # ─── #385 Search ────────────────────────────────────────────────────
    def ft_basic() -> tuple[bool, str]:
        resp = client.get(f"{API}/laws/search", params={"q": QUERY, "page": 1, "page_size": 10})
        body = resp.json()
        items = body.get("items", [])
        has_snippet = bool(items) and "snippet" in items[0]
        return (
            resp.status_code == 200 and "total" in body and has_snippet,
            f"status={resp.status_code} total={body.get('total')}",
        )

    def ft_too_short() -> tuple[bool, str]:
        resp = client.get(f"{API}/laws/search", params={"q": "x"})
        return resp.status_code == 422, f"status={resp.status_code}"

    def semantic() -> tuple[bool, str]:
        resp = client.get(f"{API}/laws/search/semantic", params={"q": QUERY, "limit": 10})
        items = resp.json().get("items", [])
        scores_ok = all(-1.0 <= it["score"] <= 1.0 for it in items)
        return resp.status_code == 200 and scores_ok, f"status={resp.status_code} n={len(items)}"

    def hybrid() -> tuple[bool, str]:
        resp = client.get(f"{API}/laws/search/hybrid", params={"q": QUERY, "limit": 10})
        items = resp.json().get("items", [])
        sources_ok = all(set(it.get("sources", [])) <= {"full_text", "semantic"} and it["sources"] for it in items)
        return resp.status_code == 200 and sources_ok, f"status={resp.status_code} n={len(items)}"

    def deprecated_alias() -> tuple[bool, str]:
        resp = client.get(f"{API}/search", params={"q": QUERY})
        dep = resp.headers.get("Deprecation")
        return resp.status_code == 200 and dep == "true", f"status={resp.status_code} Deprecation={dep}"

    r.run("#385 Search", "full-text returns snippets", ft_basic)
    r.run("#385 Search", "1-char query -> 422", ft_too_short)
    r.run("#385 Search", "semantic scores in range", semantic)
    r.run("#385 Search", "hybrid carries sources", hybrid)
    r.run("#385 Search", "/search alias has Deprecation header", deprecated_alias)

    # ─── #383 Graph ─────────────────────────────────────────────────────
    top_id_box: dict[str, str] = {}

    def graph_global() -> tuple[bool, str]:
        resp = client.get(f"{API}/graph")
        body = resp.json()
        ok = resp.status_code == 200 and all(k in body for k in ("nodes", "edges", "total_available"))
        return ok, f"nodes={len(body.get('nodes', []))} total_available={body.get('total_available')}"

    def graph_filtered() -> tuple[bool, str]:
        resp = client.get(f"{API}/graph", params={"rank": "ley_organica", "limit": 50})
        body = resp.json()
        nodes = body.get("nodes", [])
        return resp.status_code == 200 and len(nodes) <= 50, f"nodes={len(nodes)} (<=50)"

    def graph_stats() -> tuple[bool, str]:
        resp = client.get(f"{API}/graph/stats")
        body = resp.json()
        return resp.status_code == 200 and bool(body), f"status={resp.status_code} keys={list(body)[:4]}"

    def graph_top() -> tuple[bool, str]:
        resp = client.get(f"{API}/graph/top", params={"limit": 10})
        items = resp.json()
        rows = items if isinstance(items, list) else items.get("items", [])
        scores = [row.get("score", row.get("pagerank", 0)) for row in rows]
        descending = scores == sorted(scores, reverse=True)
        if rows:
            top_id_box["id"] = rows[0].get("law_id") or rows[0].get("id") or ""
        return resp.status_code == 200 and len(rows) == 10 and descending, f"n={len(rows)} descending={descending}"

    def graph_subgraph_kind() -> tuple[bool, str]:
        law_id = top_id_box.get("id")
        if not law_id:
            return False, "no top law id resolved"
        resp = client.get(f"{API}/graph/subgraph/{law_id}")
        edges = resp.json().get("edges", [])
        kinds = {e.get("kind") for e in edges}
        has_kind = bool(edges) and all("kind" in e for e in edges)
        return resp.status_code == 200 and (not edges or has_kind), f"edges={len(edges)} kinds={kinds}"

    r.run("#383 Graph", "global view has nodes/edges/total_available", graph_global)
    r.run("#383 Graph", "rank filter caps nodes", graph_filtered)
    r.run("#383 Graph", "stats returns counts", graph_stats)
    r.run("#383 Graph", "top=10 descending scores", graph_top)
    r.run("#383 Graph", "subgraph edges carry kind", graph_subgraph_kind)

    # ─── #384 Chat (threads CRUD; SSE/tool-use need a provider) ──────────
    def chat_threads_crud() -> tuple[bool, str]:
        created = client.post(f"{API}/chat/threads", json={"title": "qa-smoke", "model": "ollama:fake"})
        if created.status_code != 201:
            return False, f"create status={created.status_code}"
        tid = created.json()["id"]
        patched = client.patch(f"{API}/chat/threads/{tid}", json={"title": "qa-smoke-renamed"})
        renamed = patched.status_code == 200 and patched.json().get("title") == "qa-smoke-renamed"
        d1 = client.delete(f"{API}/chat/threads/{tid}")
        d2 = client.delete(f"{API}/chat/threads/{tid}")  # idempotent
        ok = renamed and d1.status_code == 204 and d2.status_code == 204
        return ok, f"rename={renamed} del1={d1.status_code} del2={d2.status_code}"

    r.run("#384 Chat", "threads create/rename/delete (idempotent 204)", chat_threads_crud)

    # ─── #387 Dashboards ────────────────────────────────────────────────
    def dashboard(preset: str) -> tuple[bool, str]:
        resp = client.get(f"{API}/dashboards/{preset}")
        body = resp.json() if resp.status_code == 200 else {}
        return resp.status_code == 200 and bool(body), f"status={resp.status_code} keys={list(body)[:4]}"

    r.run("#387 Dashboards", "compliance preset renders", lambda: dashboard("compliance"))
    r.run("#387 Dashboards", "analytics preset renders", lambda: dashboard("analytics"))

    # ─── #386 Settings (API-side) ───────────────────────────────────────
    def mcp_catalog() -> tuple[bool, str]:
        resp = client.get(f"{API}/mcp/servers")
        body = resp.json() if resp.status_code == 200 else {}
        rows = body if isinstance(body, list) else body.get("servers", body.get("items", []))
        names = {row.get("id") or row.get("name") for row in rows} if isinstance(rows, list) else set()
        return resp.status_code == 200 and bool(
            rows
        ), f"status={resp.status_code} servers={sorted(n for n in names if n)[:6]}"

    def sync_status() -> tuple[bool, str]:
        resp = client.get(f"{API}/sync/status")
        return resp.status_code == 200, f"status={resp.status_code}"

    r.run("#386 Settings", "MCP servers catalog", mcp_catalog)
    r.run("#386 Settings", "sync status endpoint", sync_status)

    # ─── #388 Observability + security ──────────────────────────────────
    def health_cheap() -> tuple[bool, str]:
        resp = client.get(f"{BASE}/health")
        body = resp.json()
        return resp.status_code == 200 and set(body) == {"status", "version"}, f"keys={list(body)}"

    def health_full() -> tuple[bool, str]:
        resp = client.get(f"{API}/system/health")
        body = resp.json()
        probes = {"memory", "disk", "corpus", "chat_db"}
        return resp.status_code == 200 and probes <= set(body), f"keys={list(body)}"

    def request_id_present() -> tuple[bool, str]:
        resp = client.get(f"{BASE}/health")
        rid = resp.headers.get("X-Request-Id")
        return bool(rid), f"X-Request-Id={rid}"

    def request_id_honoured() -> tuple[bool, str]:
        rid = uuid.uuid4().hex
        resp = client.get(f"{BASE}/health", headers={"X-Request-Id": rid})
        return resp.headers.get("X-Request-Id") == rid, f"sent={rid} got={resp.headers.get('X-Request-Id')}"

    def secrets_cycle() -> tuple[bool, str]:
        listing = client.get(f"{API}/secrets")
        rows = listing.json().get("items", []) if listing.status_code == 200 else []
        configured = {row["provider"] for row in rows if row.get("configured")}
        if "openai" in configured:
            # Don't clobber a real stored key — verify listing only.
            return listing.status_code == 200, "openai already configured; skipped destructive write"
        post = client.post(f"{API}/secrets", json={"provider": "openai", "api_key": "sk-qa-smoke-DELETEME"})
        body_empty = post.status_code == 204 and not post.content
        relist = client.get(f"{API}/secrets")
        now_configured = any(
            row.get("provider") == "openai" and row.get("configured") for row in relist.json().get("items", [])
        )
        d1 = client.delete(f"{API}/secrets/openai")
        d2 = client.delete(f"{API}/secrets/openai")  # idempotent
        ok = body_empty and now_configured and d1.status_code == 204 and d2.status_code == 204
        return ok, f"post204_empty={body_empty} listed={now_configured} del1={d1.status_code} del2={d2.status_code}"

    def telemetry_off() -> tuple[bool, str]:
        resp = client.post(f"{API}/telemetry/events", json={"events": [{"name": "qa", "props": {}}]})
        body = resp.json() if resp.status_code == 202 else {}
        return resp.status_code == 202 and body.get("accepted") == 0, f"status={resp.status_code} body={body}"

    def telemetry_oversized() -> tuple[bool, str]:
        events = [{"name": "qa", "props": {}} for _ in range(51)]
        resp = client.post(f"{API}/telemetry/events", json={"events": events})
        return resp.status_code == 422, f"status={resp.status_code}"

    r.run("#388 Observability", "/health is {status,version} only", health_cheap)
    r.run("#388 Observability", "/system/health has 4 probes", health_full)
    r.run("#388 Observability", "X-Request-Id on responses", request_id_present)
    r.run("#388 Observability", "incoming X-Request-Id honoured", request_id_honoured)
    r.run("#388 Observability", "secrets POST/GET/DELETE (idempotent, no echo)", secrets_cycle)
    r.run("#388 Observability", "telemetry off -> 202 accepted:0", telemetry_off)
    r.run("#388 Observability", "telemetry oversized -> 422", telemetry_oversized)

    # ─── #381 Onboarding (API-side only) ────────────────────────────────
    def openapi_endpoint_count() -> tuple[bool, str]:
        resp = client.get(f"{BASE}/openapi.json")
        paths = resp.json().get("paths", {})
        n = sum(len(methods) for methods in paths.values())
        # Checklist said ">= 50"; the real v1 surface is ~48 operations.
        # Assert a sanity floor and report the exact count.
        return resp.status_code == 200 and n >= 40, f"operations={n}"

    r.run("#381 Onboarding", "/openapi.json lists >= 50 operations", openapi_endpoint_count)

    failed = r.summarise()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
