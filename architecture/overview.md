# Architecture overview

LexFlow has four layers stacked on top of one data source. Each layer is a
package under `src/lexflow/`; the frontend consumes them through a single REST
contract.

```
┌──────────────────────────────────────────────────────────────┐
│   Frontend  (React 18 + Vite + TanStack Query + Zustand)     │
│   frontend/src/{pages,components,lib}                         │
└──────────────────────────────────────────────────────────────┘
                              │ /api/v1/*  (JSON, SSE for chat)
┌──────────────────────────────────────────────────────────────┐
│   API  (FastAPI routers)                                      │
│   src/lexflow/api/routers/{laws,articles,versions,search,graph}│
└──────────────────────────────────────────────────────────────┘
        │                │              │              │
        ▼                ▼              ▼              ▼
   ┌────────┐      ┌──────────┐   ┌──────────┐   ┌──────────────┐
   │  Core  │      │  Graph   │   │   Chat   │   │  Dashboards  │
   │ models │      │ NetworkX │   │ providers│   │   Plotly     │
   │parsers │      │  + algos │   │   + MCP  │   │   figures    │
   │registry│      │          │   │          │   │              │
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
Domain models, parsers, registry, search index, git history reader. No web
framework. Everything else builds on this.

- [`models.py`](../../src/lexflow/core/models.py) — `Law`, `Article`, `Section`, `Reference`, `LawMetadata`, `LawVersion`, `LawDiff`
- [`parser.py`](../../src/lexflow/core/parser.py) — Markdown parser
- [`metadata_parser.py`](../../src/lexflow/core/metadata_parser.py) — fast YAML-frontmatter-only parser
- [`registry.py`](../../src/lexflow/core/registry.py) — `LawRegistry` singleton (lazy parsing, search index)
- [`git_history.py`](../../src/lexflow/core/git_history.py) — `git log` / `git diff` over law files
- [`search.py`](../../src/lexflow/core/search.py) — in-memory full-text index

### API ([`src/lexflow/api/`](../../src/lexflow/api/))
FastAPI routers, dependency injection, error handlers. Depends on Core (and
Graph for the `/graph/*` router).

### Graph ([`src/lexflow/graph/`](../../src/lexflow/graph/))
NetworkX `DiGraph` of laws and their cross-references. Depends on Core.

- [`model.py`](../../src/lexflow/graph/model.py) — `LegalGraph` wrapper
- [`builder.py`](../../src/lexflow/graph/builder.py) — two-pass build from the registry
- [`algorithms.py`](../../src/lexflow/graph/algorithms.py) — PageRank, shortest path, communities
- [`cache.py`](../../src/lexflow/graph/cache.py) — JSON serialisation keyed by the submodule commit hash

### Chat ([`src/lexflow/chat/`](../../src/lexflow/chat/))
`ChatProvider` abstract base + five implementations (Ollama, LM Studio,
OpenAI, Anthropic, Google). The MCP server exposes Core operations as tools
for LLM agents.

### Dashboards ([`src/lexflow/dashboards/`](../../src/lexflow/dashboards/))
Plotly figure builders returning `plotly.graph_objects.Figure`. The frontend
consumes the JSON form via `plotly.js`.

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
- **Prod (future):** one FastAPI process serves both the API at `/api/v1/*`
  and `frontend/dist/` mounted at `/`.
- **Error contract:** the standard FastAPI shape — `{ "detail": "<msg>" }`
  for built-in errors, plus a custom `{ "error": "<Class>", "message": "<msg>" }`
  shape from [`error_handlers.py`](../../src/lexflow/api/error_handlers.py)
  for domain errors. See [`api-contract.md`](api-contract.md).
- **Versioning:** every endpoint is mounted under `/api/v1/`. Breaking
  changes ship under `/api/v2/`.

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
