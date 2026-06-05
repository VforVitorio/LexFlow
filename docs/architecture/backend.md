# Backend architecture

Source: [`src/lexflow/`](../../src/lexflow/). Entry point: [`main.py`](../../main.py).

Verified against release 0.36.x.

## Package layout

```
src/lexflow/
├── api/
│   ├── app.py             FastAPI factory + lifespan + SPA mount
│   ├── middleware.py      RequestIdMiddleware + access log (#92)
│   ├── spa.py             mount_spa() — serves frontend/dist/ at /
│   ├── warmup.py          Background metadata/search/graph priming (#222)
│   ├── dependencies.py    PaginationParams, get_law_registry(), get_graph()
│   ├── error_handlers.py  Maps domain exceptions to JSON responses
│   └── routers/
│       ├── laws.py            /api/v1/laws + /references (#357)
│       ├── articles.py        /api/v1/laws/{id}/articles
│       ├── versions.py        /api/v1/laws/{id}/versions, /diff
│       ├── search.py          /api/v1/laws/search + /search/semantic (#369)
│       ├── graph.py           /api/v1/graph/* + /api/v1/graph global (#358)
│       ├── tags.py            /api/v1/tags
│       ├── dashboards.py      /api/v1/dashboards/{preset}
│       ├── sync.py            POST /api/v1/sync (git pull legalize-es)
│       ├── system.py          /system/warmup, /whats-new, /profile, /health
│       ├── models.py          /api/v1/models + /models/pull (SSE, #119)
│       ├── chat_threads.py    /api/v1/chat/threads + SSE /send (#83 + #84)
│       ├── mcp_servers.py     /api/v1/mcp/servers, /tools (#121), /bundles (#123)
│       ├── secrets.py         /api/v1/secrets (#120 + keyring)
│       └── telemetry.py       /api/v1/telemetry/status, /events (#331)
├── core/
│   ├── models.py          Pydantic domain models (frozen)
│   ├── schemas.py         API response wrappers (PaginatedResponse[T], …)
│   ├── enums.py           LawRank, LawStatus, Scope, Jurisdiction, ReferenceKind (#144)
│   ├── exceptions.py      LawNotFoundError, ParserError, DataPathError, …
│   ├── parser.py          Full Markdown → Law parser + reference classification
│   ├── metadata_parser.py Fast frontmatter-only parser
│   ├── registry.py        LawRegistry singleton, lazy parse, search build
│   ├── services.py        Cross-cutting helpers (find_article, filters, paginate)
│   ├── git_history.py     GitHistoryReader (log + diff)
│   ├── corpus_revision.py Submodule SHA helpers
│   ├── delta_sync.py      Corpus diff between commits (#230)
│   ├── search/
│   │   ├── embedder.py    Embedder ABC + HashEmbedder placeholder (#369)
│   │   └── index.py       SemanticIndex (numpy matmul + argpartition)
│   ├── system_profile.py  Hardware detection for the model wizard (#117)
│   ├── health.py          Extended health snapshot (#330)
│   └── telemetry.py       Opt-in JSONL event store (#331)
├── graph/
│   ├── model.py           LegalGraph (NetworkX DiGraph wrapper, typed edges)
│   ├── builder.py         build_graph(registry) + apply_diff_to_graph (#230)
│   └── algorithms.py      PageRank, shortest path, communities
├── chat/
│   ├── base.py            ChatProvider ABC + stream_chat_typed union (#195)
│   ├── provider_registry.py Registry of provider specs (key, factory, env)
│   ├── streaming.py       SSE substrate + agentic tool-use loop (#84 / #195)
│   ├── rate_limit.py      Per-provider token buckets (#93)
│   ├── secrets.py         OS-keyring API key store + env fallback (#120)
│   ├── mcp_server.py      FastMCP tools wrapped by _audited
│   ├── mcp_client.py      MCPMultiClient — consume external MCP servers (#121)
│   ├── audit/             Hash-chained JSONL audit log (#124)
│   ├── db.py              Chat thread SQLite engine
│   ├── storage_models.py  SQLModel tables for ChatThread + ChatMessage
│   ├── schemas.py         API shapes for /api/v1/chat/*
│   └── providers/
│       ├── ollama.py
│       ├── lmstudio.py
│       ├── openai_provider.py
│       ├── anthropic_provider.py
│       └── google_provider.py
├── mcp_servers/
│   ├── catalog.py         BUILTIN_SERVERS — fetch, filesystem, mcp-pandoc, boe-mcp
│   ├── config.py          load/save <config_dir>/mcp.json (#122)
│   ├── schemas.py         BuiltinMcpServer, UserMcpServerEntry, McpServerCommand
│   └── bundle.py          .mcpb install: zip-slip-safe extract (#123)
├── dashboards/
│   ├── analytics.py       reforms_by_year, rank_distribution, …
│   └── compliance.py      filter_laws, compliance_timeline, export_csv
└── utils/
    ├── config.py          Settings dataclass + get_settings()
    ├── logging_config.py  JSON / console formatter + request_id ContextVar (#92)
    └── file_discovery.py  list_law_files, law_id_from_path
```

## Key abstractions

### `LawRegistry` ([`registry.py`](../../src/lexflow/core/registry.py))

Singleton (via `lru_cache`) that holds the corpus. Three caches stack:

1. **Index** — `dict[str, Path]`, built eagerly at construction by scanning
   filenames. ~12 K files, <1 s.
2. **Metadata cache** — `dict[str, LawMetadata]`, populated by
   `parse_metadata_only` (frontmatter only). Cheap.
3. **Full law cache** — `dict[str, Law]`, populated by `parse_law_file` on
   first request. Thread-safe with a double-checked lock.

Public surface: `get_law`, `get_metadata`, `list_laws`, `search_text`,
`preload_all_metadata`, `total_count`, `law_ids`.

### `Settings` ([`utils/config.py`](../../src/lexflow/utils/config.py))

Frozen dataclass, env-driven, accessed through `get_settings()` (also
`lru_cache`'d). Knows where the data directory lives (`LEXFLOW_DATA_PATH`)
and the per-user config dir (`LEXFLOW_CONFIG_DIR`, defaults to
`~/.lexflow/`) where the audit log, MCP config, telemetry JSONL and chat
DB land.

### Dependency injection ([`api/dependencies.py`](../../src/lexflow/api/dependencies.py))

- `get_law_registry()` — `Depends` provider for the singleton registry.
- `get_graph()` — `Depends` provider for the `LegalGraph` singleton, with
  the indirection routed through `dependencies.py` so tests can override
  it without poking module globals (issue #101).
- `PaginationParams` — class dependency for `?page=&page_size=` with bounds.

Routers never instantiate the registry or graph directly.

### `LegalGraph` ([`graph/model.py`](../../src/lexflow/graph/model.py))

Thin wrapper around `nx.DiGraph`. Nodes carry the law's `title` / `rank` /
`status` / `scope` / `jurisdiction`; edges carry `kind`
(cites/modifies/repeals/develops, #144), `source_article` and the raw
`reference_text`. The raw graph is reachable via the `.graph` property for
algorithm code in [`algorithms.py`](../../src/lexflow/graph/algorithms.py).

Incremental updates: `apply_diff_to_graph(diff)` (#230) consumes a
`CorpusDiff` from `core/delta_sync.py` and patches the graph in place
using a dangling-references index for cheap incoming-edge resolution.

### `ChatProvider` ([`chat/base.py`](../../src/lexflow/chat/base.py))

```python
class ChatProvider(ABC):
    async def list_models(self) -> list[str]: ...
    def stream_chat(self, messages, model) -> AsyncIterator[str]: ...
    # Default impl bridges stream_chat → StreamChunk union.
    async def stream_chat_typed(
        self, messages, model, tools=None,
    ) -> AsyncIterator[StreamChunk]: ...
```

`StreamChunk = TextChunk | ToolCallChunk | FinishChunk` is the surface the
agentic loop in [`streaming.py`](../../src/lexflow/chat/streaming.py)
iterates over. Providers that override `stream_chat_typed` natively (none
in main today — see [the roadmap](../../ROADMAP.md) for the per-SDK
follow-ups) get to emit tool calls; everyone else falls back to text-only
via the default bridge.

### Agentic loop ([`chat/streaming.py`](../../src/lexflow/chat/streaming.py))

`stream_chat_reply` is the generator behind `POST /api/v1/chat/threads/{id}/send`.
It:

1. Persists the user turn (so a stream failure doesn't lose the question).
2. Resolves the provider via `provider_registry.PROVIDERS_BY_KEY`.
3. Iterates `stream_chat_typed` up to `_MAX_TOOL_ITERATIONS = 5` times,
   dispatching tool calls inline via `mcp_server.dispatch_tool`.
4. Emits SSE events: `text` / `tool_call` / `source` / `error` / `done`.
5. Persists the assembled assistant turn.

### Audit log ([`chat/audit/`](../../src/lexflow/chat/audit/))

`@_audited("tool_name")` wraps every MCP tool. Each call appends a
hash-chained pair of records (`tool_call_start` + `tool_call_end`) to
`<config_dir>/mcp.log`. The schema follows the Agent_Sudo draft
(`v0.4.0-rc13`); LexFlow extension fields use the `lexflow_*` prefix.

### Telemetry ([`core/telemetry.py`](../../src/lexflow/core/telemetry.py))

Off by default. The backend persists events only when
`LEXFLOW_TELEMETRY_ENABLED=1` is set; the SPA additionally gates on the
user's Zustand `telemetryConsent`. Both gates must be on for a byte to
reach disk. Storage is one JSONL file per UTC day under
`<config_dir>/telemetry/`.

## Error handling

Domain code raises specific exceptions from
[`exceptions.py`](../../src/lexflow/core/exceptions.py):

| Exception | Status |
|-----------|--------|
| `LawNotFoundError` | 404 |
| `ArticleNotFoundError` | 404 |
| `ParserError` | 500 |
| `DataPathError` | 503 |

[`error_handlers.register_error_handlers`](../../src/lexflow/api/error_handlers.py)
turns them into `{ "error": "<Name>", "message": "<msg>", "code": "<tag>" }`
JSON. All other exceptions fall through to FastAPI's default
`{ "detail": "<msg>" }` shape.

CodeQL `py/log-injection` does **not** treat `%r` / `%s` as sanitisers.
Whenever a logger interpolates user-controlled input, use explicit
`repr()` calls instead — see `chat/streaming.py`, `chat/rate_limit.py`,
`api/middleware.py`, `core/telemetry.py` for the pattern.

## Where things live (cheat sheet)

| You want to change… | Edit |
|---------------------|------|
| Markdown parsing rules | `core/parser.py` |
| Reference kind heuristic (cites/modifies/repeals/develops) | `core/parser.py:_classify_reference` |
| YAML frontmatter fields | `core/metadata_parser.py` + `core/models.py:LawMetadata` |
| Enum values | `core/enums.py` |
| API shapes | `core/schemas.py` |
| Pagination defaults | `api/dependencies.py:PaginationParams` |
| Error→HTTP mapping | `api/error_handlers.py` |
| Health probe thresholds | `core/health.py` (`_DISK_WARN_PERCENT`, `_MEM_WARN_PERCENT`) |
| Graph build pass | `graph/builder.py` |
| Graph incremental update | `graph/builder.py:apply_diff_to_graph` |
| New MCP tool | `chat/mcp_server.py` (decorate `@_audited(name)` and add to `TOOLS` + `TOOL_SPECS`) |
| New built-in MCP server in the catalogue | `mcp_servers/catalog.py:BUILTIN_SERVERS` |
| Rate-limit env knobs | `chat/rate_limit.py:_ENV_BY_PROVIDER` |
| Cloud provider key resolution | `chat/secrets.py` |
| New dashboard figure | `dashboards/analytics.py` or `compliance.py` |
| Add a new chat provider | New file in `chat/providers/` + register in `chat/provider_registry.py:PROVIDERS_BY_KEY` |
