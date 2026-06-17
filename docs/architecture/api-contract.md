# API contract

The wire contract between FastAPI and the React client. Everything lives
under `/api/v1/`.

## Base URL

| Environment | Base |
|-------------|------|
| Dev (Vite proxy) | `/api/v1/...` → `http://localhost:8000/api/v1/...` |
| Dev (direct) | `http://localhost:8000/api/v1/...` |
| Prod (single process) | `<host>/api/v1/...` |

The proxy is configured in [`frontend/vite.config.ts`](../../frontend/vite.config.ts);
no CORS configuration is needed in dev. The router prefixes are applied in
[`src/lexflow/api/app.py`](../../src/lexflow/api/app.py) — 13 routers under
`/api/v1` as of release 0.58.x:

```python
app.include_router(search.router,       prefix="/api/v1")  # MUST come before laws — see laws router note
app.include_router(laws.router,         prefix="/api/v1")
app.include_router(articles.router,     prefix="/api/v1")
app.include_router(versions.router,     prefix="/api/v1")
app.include_router(graph_router,        prefix="/api/v1")
app.include_router(models.router,       prefix="/api/v1")
app.include_router(chat_threads.router, prefix="/api/v1")
app.include_router(dashboards.router,   prefix="/api/v1")
app.include_router(sync.router,         prefix="/api/v1")
app.include_router(system.router,       prefix="/api/v1")
app.include_router(tags.router,         prefix="/api/v1")
app.include_router(mcp_servers.router,  prefix="/api/v1")
app.include_router(secrets.router,      prefix="/api/v1")
app.include_router(telemetry.router,    prefix="/api/v1")
```

See [api-endpoints.md](../backend/api-endpoints.md) for the per-route inventory.

## CORS

**There is no `CORSMiddleware`, and there should not be one** under the
current single-origin architecture. The browser never makes a
cross-origin request to the API, so CORS simply does not apply:

| Environment | Why CORS is OFF |
|-------------|-----------------|
| Prod / packaged | One FastAPI process serves both the API (`/api/v1/*`) and the SPA (`mount_spa`, see [`api/app.py`](../../src/lexflow/api/app.py)) from the **same origin**. Same-origin → no preflight, no `Access-Control-*` headers. |
| Dev | Vite (`:5173`) proxies `/api/*` → backend (`:8000`) — see [`frontend/vite.config.ts`](../../frontend/vite.config.ts). From the browser's view every request is same-origin (`:5173`); the proxy hop is server-to-server and never triggers CORS. |

Practical consequences for contributors:

- **Do not add `app.add_middleware(CORSMiddleware, ...)`** to "fix" a
  fetch failure in dev. A failing `/api/*` call in dev is a **proxy or
  backend-down** problem, not CORS — check the Vite proxy and that the
  backend is running on `:8000`.
- **Do not call the backend with an absolute origin** (`http://localhost:8000/...`)
  from frontend code. Always use the relative `/api/v1/...` path so the
  same-origin contract holds in both dev and prod.

The **only** future scenario that would require `CORSMiddleware` is a
**separate-origin deployment** — e.g. the SPA served from a CDN/different
host than the API. If that day comes, add the middleware with an
**explicit origin allowlist** (never `allow_origins=["*"]` alongside
credentials) and document the allowed origins here. Until then, the seam
stays closed.

## Versioning

- All endpoints live under `/api/v1/`.
- **Never** silently change a `/api/v1/*` response shape. Add a field
  (additive change) only if it is optional.
- Breaking changes ship under `/api/v2/`. Both major versions can coexist
  during a deprecation window.

## Response shapes

Defined in [`core/schemas.py`](../../src/lexflow/core/schemas.py). The
important generic:

```python
class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    # computed: total_pages, has_next, has_previous
```

See [api-endpoints.md](../backend/api-endpoints.md) for endpoint-by-endpoint
shapes.

## Error contract

Two shapes coexist. **This is intentional but should be unified before v2.**

### Domain errors (custom)

Emitted by handlers in [`api/error_handlers.py`](../../src/lexflow/api/error_handlers.py):

```json
{ "error": "LawNotFound",      "message": "Law not found: 'BOE-A-XXX'" }
{ "error": "ArticleNotFound",  "message": "Article '99' not found in law 'BOE-A-XXX'" }
{ "error": "ParserError",      "message": "Failed to parse '...': <reason>" }
{ "error": "DataUnavailable",  "message": "Data directory not found: '...'" }
```

Status codes: 404 / 404 / 500 / 503.

### Validation + generic errors (FastAPI default)

```json
{ "detail": "Invalid pagination parameters" }
```

Or for 422, FastAPI's structured `{ "detail": [ { "loc": [...], "msg": "...", "type": "..." } ] }`.

The frontend error boundary handles both shapes.

## Type generation (live)

The SPA consumes types generated from `/openapi.json` via
`openapi-typescript`:

```bash
npm --prefix frontend run generate:api      # → frontend/src/api/schema.ts
```

Re-run whenever a Pydantic model or endpoint signature changes. CI does
not yet enforce that the committed `schema.ts` matches the live backend
— that gate is on the follow-up list.

## Chat streaming (live)

`POST /api/v1/chat/threads/{thread_id}/send` returns a Server-Sent Events
stream. The agentic loop (#84 + #195) drives it: text deltas, tool-call
events when the provider asks for an MCP tool, source events when a tool
result carries citations, finally a `done` event. Wire format:

```
event: text
data: {"delta":"Hola "}

event: tool_call
data: {"call_id":"c1","name":"search_law","args":{"query":"…"}}

event: source
data: {"law_id":"BOE-A-2018-16673","article_number":"22"}

event: text
data: {"delta":"El artículo dice…"}

event: done
data: {}
```

Pre-stream errors emerge as standard HTTP responses (`404` for unknown
thread, `429 Retry-After` when the per-provider rate-limit bucket
(#93) runs dry).

`POST /api/v1/models/pull` is also SSE — wire format
`progress` / `done` / `error` events for the wizard's installer UI (#119).

## Auth (not yet)

Per [`CLAUDE.md` §6](../../CLAUDE.md): when auth lands, cookie-based session,
`SameSite=Lax`, `HttpOnly`, `Secure` in prod. JWTs in localStorage are
forbidden.

## Health

`GET /health` returns `{ "status": "ok", "version": "<x.y.z>" }` — the
cheap liveness probe used by docker / uvicorn. The extended snapshot
(memory, disk, corpus, chat DB) lives at `GET /api/v1/system/health`
(#330).
