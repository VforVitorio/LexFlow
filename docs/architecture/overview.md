# Architecture overview

LexFlow has four layers stacked on top of one data source. Each layer is a
package under `src/lexflow/`; the frontend consumes them through a single REST
contract.

```
┌──────────────────────────────────────────────────────────────┐
│   Frontend  (React 18 + Vite + TanStack Query + Zustand)     │
│   frontend/src/{pages,components,lib}                         │
└──────────────────────────────────────────────────────────────┘
                              │ /api/v1/*  (JSON, SSE for chat + Ollama pull)
┌──────────────────────────────────────────────────────────────┐
│   API  (FastAPI routers — 13 routers under /api/v1/)          │
│   laws articles versions search graph tags dashboards         │
│   sync system models chat_threads mcp_servers secrets         │
│   telemetry                                                   │
└──────────────────────────────────────────────────────────────┘
        │                │              │              │
        ▼                ▼              ▼              ▼
   ┌────────┐      ┌──────────┐   ┌──────────┐   ┌──────────────┐
   │  Core  │      │  Graph   │   │   Chat   │   │  Dashboards  │
   │ models │      │ NetworkX │   │ providers│   │   Plotly     │
   │parsers │      │ + algos  │   │ streaming│   │   figures    │
   │registry│      │  + cache │   │  + MCP   │   │              │
   │ search │      │          │   │  + audit │   │              │
   │ health │      │          │   │  + secrets   │              │
   └────┬───┘      └────┬─────┘   └────┬─────┘   └──────┬───────┘
        │                │              │                │
        └────────────────┼──────────────┴────────────────┘
                         ▼
              ┌────────────────────────┐
              │   data/legalize-es/    │
              │   (git submodule)      │
              │   Markdown + git log    │
              └────────────────────────┘
```

## Layer responsibilities

### Core ([`src/lexflow/core/`](../../src/lexflow/core/))
Domain models, parsers, registry, search (text + semantic), git history,
delta sync, health probes. No web framework. Everything else builds on this.

- [`models.py`](../../src/lexflow/core/models.py) — `Law`, `Article`, `Section`, `Reference` (typed via `ReferenceKind`, #144), `LawMetadata`
- [`parser.py`](../../src/lexflow/core/parser.py) — Markdown parser with reference extraction + classification (#144)
- [`metadata_parser.py`](../../src/lexflow/core/metadata_parser.py) — fast YAML-frontmatter-only parser
- [`registry.py`](../../src/lexflow/core/registry.py) — `LawRegistry` singleton (lazy parsing, full-text index)
- [`services.py`](../../src/lexflow/core/services.py) — cross-cutting helpers (`find_article`, filters, pagination)
- [`git_history.py`](../../src/lexflow/core/git_history.py) — `git log` / `git diff` over law files
- [`corpus_revision.py`](../../src/lexflow/core/corpus_revision.py) — submodule SHA helpers
- [`delta_sync.py`](../../src/lexflow/core/delta_sync.py) — corpus diff between commits (#230)
- [`search/`](../../src/lexflow/core/search/) — semantic search subpackage: `Embedder` ABC + `HashEmbedder` placeholder + `SemanticIndex` (#369)
- [`system_profile.py`](../../src/lexflow/core/system_profile.py) — hardware detection for the model wizard (#117)
- [`health.py`](../../src/lexflow/core/health.py) — extended health snapshot (#330)
- [`telemetry.py`](../../src/lexflow/core/telemetry.py) — opt-in JSONL event store (#331)

### API ([`src/lexflow/api/`](../../src/lexflow/api/))
FastAPI routers, dependency injection, error handlers, the SPA mount,
request-id correlation middleware, warm-up scheduler.

- [`app.py`](../../src/lexflow/api/app.py) — FastAPI factory + lifespan
- [`middleware.py`](../../src/lexflow/api/middleware.py) — `RequestIdMiddleware` + access log (#92)
- [`spa.py`](../../src/lexflow/api/spa.py) — mounts `frontend/dist/` at `/` in prod
- [`warmup.py`](../../src/lexflow/api/warmup.py) — background metadata/search/graph priming (#222)
- [`routers/`](../../src/lexflow/api/routers/) — 13 routers, one per resource (see [api-endpoints.md](../backend/api-endpoints.md))

### Graph ([`src/lexflow/graph/`](../../src/lexflow/graph/))
NetworkX `DiGraph` of laws + typed cross-references. Depends on Core.

- [`model.py`](../../src/lexflow/graph/model.py) — `LegalGraph` wrapper (nodes carry metadata, edges carry `kind`)
- [`builder.py`](../../src/lexflow/graph/builder.py) — two-pass build + incremental apply-diff (#230)
- [`algorithms.py`](../../src/lexflow/graph/algorithms.py) — PageRank, shortest path, communities

### Chat ([`src/lexflow/chat/`](../../src/lexflow/chat/))
The richest layer post-Sprint 14. Five providers + agentic streaming +
in-process MCP server + external MCP client + audit log + keyring-backed
secrets + rate limiting.

- [`base.py`](../../src/lexflow/chat/base.py) — `ChatProvider` ABC + `stream_chat_typed` typed union for the agentic loop (#195)
- [`providers/`](../../src/lexflow/chat/providers/) — Ollama, LM Studio, OpenAI, Anthropic, Google
- [`provider_registry.py`](../../src/lexflow/chat/provider_registry.py) — registry of provider specs (key, factory, env)
- [`streaming.py`](../../src/lexflow/chat/streaming.py) — SSE substrate + agentic tool-use loop (#84 / #195)
- [`mcp_server.py`](../../src/lexflow/chat/mcp_server.py) — FastMCP tools (`search_law`, `get_law`, `get_article`, `get_stats`) wrapped by `_audited`
- [`mcp_client.py`](../../src/lexflow/chat/mcp_client.py) — `MCPMultiClient` consuming external MCP servers (#121)
- [`audit/`](../../src/lexflow/chat/audit/) — hash-chained JSONL audit log for every MCP tool call (#124)
- [`secrets.py`](../../src/lexflow/chat/secrets.py) — OS-keyring API key store with env-var fallback (#120)
- [`rate_limit.py`](../../src/lexflow/chat/rate_limit.py) — per-provider token buckets (#93)
- [`db.py`](../../src/lexflow/chat/db.py) + [`storage_models.py`](../../src/lexflow/chat/storage_models.py) — SQLite + SQLModel persistence for chat threads (#83)

### Dashboards ([`src/lexflow/dashboards/`](../../src/lexflow/dashboards/))
Plotly figure builders returning `plotly.graph_objects.Figure`. The frontend
consumes the JSON form via `plotly.js`.

### MCP servers config ([`src/lexflow/mcp_servers/`](../../src/lexflow/mcp_servers/))
Catalogue + persistence for external MCP servers the user can attach
(built-in + Claude-Desktop-schema JSON in `<config_dir>/mcp.json`, #122).
Bundle install for `.mcpb` (#123). Consumed by `chat/mcp_client.py`.

## Dependency rule

```
utils ← core ← api ← chat
                ↑
        graph ──┤
                ↑
       dashboards
```

Dependencies flow leftward/upward. Nothing in `core/` may import from `api/`,
`chat/`, or `graph/`. This keeps Core reusable from the MCP server, scripts,
notebooks and tests.

## How the frontend talks to the backend

- **Dev:** Vite at `:5173` proxies `/api/*` → `http://localhost:8000/api/*`.
  See [`frontend/vite.config.ts`](../../frontend/vite.config.ts).
- **Prod:** one FastAPI process serves both the API at `/api/v1/*` and
  `frontend/dist/` mounted at `/` ([`api/spa.py`](../../src/lexflow/api/spa.py),
  shipped in Sprint 1). No reverse proxy needed; no CORS.
- **Error contract:** the standard FastAPI shape — `{ "detail": "<msg>" }`
  for built-in errors, plus a custom `{ "error": "<Class>", "message": "<msg>" }`
  shape from [`error_handlers.py`](../../src/lexflow/api/error_handlers.py)
  for domain errors. See [`api-contract.md`](api-contract.md).
- **Versioning:** every endpoint is mounted under `/api/v1/`. Breaking
  changes ship under `/api/v2/`.
- **Request id correlation:** every response carries `X-Request-Id`, and
  the structured log line for the request carries the same id
  (`RequestIdMiddleware`, #92).

## Data flow for a typical request

A user clicks a law in the Explorer:

1. Browser → `GET /api/v1/laws/BOE-A-2018-16673`
2. [`laws.get_law`](../../src/lexflow/api/routers/laws.py) calls
   `registry.get_law(law_id)`
3. The registry checks its cache; on miss, [`parser.parse_law_file`](../../src/lexflow/core/parser.py)
   reads the Markdown, builds `Law(metadata=..., sections=..., articles=..., references=...)`
4. The router serialises into `LawDetail` ([`schemas.py`](../../src/lexflow/core/schemas.py))
5. TanStack Query caches the response on the React side

## Related

- [backend.md](backend.md) — backend internals in depth
- [frontend.md](frontend.md) — frontend layout
- [api-contract.md](api-contract.md) — wire-level contract
