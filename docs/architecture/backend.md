# Backend architecture

Source: [`src/lexflow/`](../../src/lexflow/). Entry point: [`main.py`](../../main.py).

## Package layout

```
src/lexflow/
├── api/
│   ├── app.py             FastAPI factory + lifespan
│   ├── dependencies.py    PaginationParams, get_law_registry()
│   ├── error_handlers.py  Maps domain exceptions to JSON responses
│   └── routers/
│       ├── laws.py        /api/v1/laws
│       ├── articles.py    /api/v1/laws/{id}/articles
│       ├── versions.py    /api/v1/laws/{id}/versions, /diff
│       ├── search.py      /api/v1/search
│       └── graph.py       /api/v1/graph/*
├── core/
│   ├── models.py          Pydantic domain models (frozen)
│   ├── schemas.py         API response shapes (PaginatedResponse[T], …)
│   ├── enums.py           LawRank, LawStatus, Scope, Jurisdiction, …
│   ├── exceptions.py      LawNotFoundError, ParserError, DataPathError, …
│   ├── parser.py          Full Markdown → Law parser
│   ├── metadata_parser.py Fast frontmatter-only parser
│   ├── registry.py        LawRegistry singleton, lazy parse, search build
│   ├── search.py          In-memory text index
│   └── git_history.py     GitHistoryReader (log + diff)
├── graph/
│   ├── model.py           LegalGraph (NetworkX DiGraph wrapper)
│   ├── builder.py         build_graph(registry) — two-pass
│   ├── algorithms.py      PageRank, shortest path, communities
│   └── cache.py           load_or_build with hash invalidation
├── chat/
│   ├── base.py            ChatProvider ABC + ChatMessage + ChatProviderError
│   ├── mcp_server.py      FastMCP tools (search_law, get_law, get_article, get_stats)
│   └── providers/
│       ├── ollama.py
│       ├── lmstudio.py
│       ├── openai_provider.py
│       ├── anthropic_provider.py
│       └── google_provider.py
├── dashboards/
│   ├── analytics.py       reforms_by_year, rank_distribution, …
│   └── compliance.py      filter_laws, compliance_timeline, export_csv
└── utils/
    ├── config.py          Settings dataclass + get_settings()
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
`lru_cache`'d). The single place that knows where the data directory lives.

### Dependency injection ([`api/dependencies.py`](../../src/lexflow/api/dependencies.py))

- `get_law_registry()` — `Depends` provider for the singleton registry.
- `PaginationParams` — class dependency for `?page=&page_size=` with bounds.

Routers never instantiate the registry directly.

### `LegalGraph` ([`graph/model.py`](../../src/lexflow/graph/model.py))

Thin wrapper around `nx.DiGraph` exposing only the operations LexFlow needs
(`add_law`, `add_reference`, `get_neighbors`, `get_subgraph`). The raw graph
is reachable via the `.graph` property for algorithm code in
[`algorithms.py`](../../src/lexflow/graph/algorithms.py).

### `ChatProvider` ([`chat/base.py`](../../src/lexflow/chat/base.py))

```python
class ChatProvider(ABC):
    async def list_models(self) -> list[str]: ...
    def stream_chat(self, messages: list[ChatMessage], model: str) -> AsyncIterator[str]: ...
```

All five providers conform. The chat router (planned) will pick one based on
a runtime config and stream chunks back over SSE.

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
turns them into `{ "error": "<Name>", "message": "<msg>" }` JSON. All other
exceptions fall through to FastAPI's default `{ "detail": "<msg>" }` shape.

## Where things live (cheat sheet)

| You want to change… | Edit |
|---------------------|------|
| Markdown parsing rules | `core/parser.py` |
| YAML frontmatter fields | `core/metadata_parser.py` + `core/models.py:LawMetadata` |
| Enum values | `core/enums.py` |
| API shapes | `core/schemas.py` |
| Pagination defaults | `api/dependencies.py:PaginationParams` |
| Error→HTTP mapping | `api/error_handlers.py` |
| Graph build pass | `graph/builder.py` |
| New MCP tool | `chat/mcp_server.py` |
| New dashboard figure | `dashboards/analytics.py` or `compliance.py` |
