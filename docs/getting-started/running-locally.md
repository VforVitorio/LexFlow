# Running locally

There are three local-run modes: backend only, frontend only with mocks, and
both together (production-like).

## Mode 1 — Backend only

```bash
uv run python main.py
```

[`main.py`](../../main.py) starts Uvicorn on `127.0.0.1:8000` with `reload=True`.
The FastAPI app is built in [`src/lexflow/api/app.py`](../../src/lexflow/api/app.py)
and exposes:

- Swagger UI — http://localhost:8000/docs
- ReDoc — http://localhost:8000/redoc
- OpenAPI JSON — http://localhost:8000/openapi.json
- Health probe — http://localhost:8000/health (used by the Docker healthcheck)

Hot reload is on, so any change under `src/lexflow/` restarts the server.

### Sanity check

```bash
curl http://localhost:8000/api/v1/laws?page=1
curl "http://localhost:8000/api/v1/search?q=protección"
```

If the response is `503 DataUnavailable`, the submodule is empty. See
[troubleshooting.md](troubleshooting.md).

## Mode 2 — Frontend only, mock data

```bash
cd frontend
pnpm dev
```

Vite starts on `http://localhost:5173` and proxies `/api/*` to whatever
`VITE_API_URL` resolves to (default `http://localhost:8000`). See
[`vite.config.ts`](../../frontend/vite.config.ts).

With `VITE_USE_MOCK=true` in `.env.local` the UI runs against an in-process
fake API — useful for designing pages without a live backend.

> **State of the frontend (May 2026):** the `src/lib/*` modules referenced
> throughout [`frontend/README.md`](../../frontend/README.md) (`api.ts`,
> `api.mock.ts`, `mock-data.ts`, `queries.ts`, `store.ts`, `hotkeys.ts`,
> `utils.ts`) are **not yet committed**. Imports from `@/lib/...` in pages and
> shell components will fail until those modules exist. Track this in the
> frontend Epic (#TBD); for now the page files compile but the app does not
> boot end-to-end.

## Mode 3 — Both together (production-like)

```bash
cd frontend && pnpm build && cd ..
uv run python main.py
```

The FastAPI process serves the API at `/api/v1/*` and (once the static-files
mount is wired) the SPA at `/`. The single-process flow is what PyInstaller
will eventually package.

## Environment variables

### Backend ([`src/lexflow/utils/config.py`](../../src/lexflow/utils/config.py))

| Variable | Default | Effect |
|----------|---------|--------|
| `LEXFLOW_DATA_PATH` | `<repo>/data/legalize-es` | Where the corpus lives |
| `LEXFLOW_PAGE_SIZE` | `20` | Default page size |
| `LEXFLOW_PAGE_SIZE_MAX` | `100` | Hard cap on `page_size` query param |
| `LEXFLOW_LOG_LEVEL` | `INFO` | Standard Python log level |
| `OPENAI_API_KEY` | unset | Read by [`OpenAIProvider`](../../src/lexflow/chat/providers/openai_provider.py) |
| `ANTHROPIC_API_KEY` | unset | Read by [`AnthropicProvider`](../../src/lexflow/chat/providers/anthropic_provider.py) |
| `GOOGLE_API_KEY` | unset | Read by [`GoogleProvider`](../../src/lexflow/chat/providers/google_provider.py) |

### Frontend ([`frontend/.env.example`](../../frontend/.env.example))

| Variable | Default | Effect |
|----------|---------|--------|
| `VITE_API_URL` | `http://localhost:8000` | Proxy target for `/api/*` |
| `VITE_USE_MOCK` | `true` | Use in-process mock API |
| `VITE_DEFAULT_MODEL` | `claude-sonnet-4-5` | Default chat model id |

## Useful one-offs

```bash
uv run pytest -v -k graph              # subset of tests
uv run ruff format .                   # auto-format
uv run python -m lexflow.chat.mcp_server   # start the MCP server alone (Phase 3)
```
