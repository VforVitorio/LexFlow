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
[`src/lexflow/api/app.py`](../../src/lexflow/api/app.py):

```python
app.include_router(laws.router, prefix="/api/v1")
app.include_router(articles.router, prefix="/api/v1")
app.include_router(versions.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(graph_router, prefix="/api/v1")
```

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

The frontend error boundary must handle both shapes. A unification ticket
is tracked in the backend epic (#TBD).

## Type generation (planned)

Per [`CLAUDE.md` §6](../../CLAUDE.md), the frontend will consume types
generated from `/openapi.json` via `openapi-typescript`. The command (not yet
wired into CI):

```bash
pnpm generate:api      # → frontend/src/api/schema.ts
```

CI will fail when `schema.ts` is stale relative to the running backend.

## Chat streaming (planned)

Per [`CLAUDE.md` §6](../../CLAUDE.md): SSE over
`GET /api/v1/chat/stream?...`. The chat router is not yet implemented; track
the SSE schema in the chat epic. Reference frame format from
[`frontend/README.md`](../../frontend/README.md):

```
event: chunk
data: {"type":"text","delta":"…"}

event: chunk
data: {"type":"tool_call","name":"search_corpus","args":{...}}

event: chunk
data: {"type":"source","source":{...}}

event: done
data: {"type":"done"}
```

## Auth (not yet)

Per [`CLAUDE.md` §6](../../CLAUDE.md): cookie-based session, `SameSite=Lax`,
`HttpOnly`, `Secure` in prod. JWTs in localStorage are forbidden.

## Health

`GET /health` returns `{ "status": "ok", "version": "<x.y.z>" }`. Used by
the Docker healthcheck — see [`docker-compose.yml`](../../docker-compose.yml).
