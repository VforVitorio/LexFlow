# API endpoints

Every endpoint lives under `/api/v1/` (except `/health`, which sits at root for
liveness probes). Sources: [`src/lexflow/api/routers/`](../../src/lexflow/api/routers/).
Models referenced below are documented in [core-models.md](core-models.md) and the
response wrappers in [`core/schemas.py`](../../src/lexflow/core/schemas.py).

Last verified against release 0.36.x.

## Laws — [`routers/laws.py`](../../src/lexflow/api/routers/laws.py)

### `GET /api/v1/laws`

Paginated list with optional filters.

| Query param | Type | Default | Notes |
|-------------|------|---------|-------|
| `page` | int ≥ 1 | 1 | |
| `page_size` | int 1–100 | 20 | |
| `rank` | `LawRank` | — | `ley`, `ley_organica`, `real_decreto`, … |
| `status` | `LawStatus` | — | `in_force`, `repealed`, `partially_repealed` |
| `scope` | `Scope` | — | `Estatal`, `Autonómico`, `Local` |
| `jurisdiction` | str | — | `es`, `es-md`, `es-ct`, … |

Response: `PaginatedResponse[LawSummary]`.

### `GET /api/v1/laws/{law_id}`

Full parsed law. Triggers a full-file parse on first hit; cached thereafter.

Response: `LawDetail` (`metadata`, `sections`, `articles`, `references`, `article_count`).

### `GET /api/v1/laws/{law_id}/references`  *(#96 / #357)*

Just the cross-references — skips the multi-MB article bodies.

| Query param | Type | Default | Notes |
|-------------|------|---------|-------|
| `include_unresolved` | bool | `false` | If `true`, also returns raw textual mentions whose target isn't in the corpus |

Response: `LawReferencesResponse` — `{ references: [Reference, ...], total: int }`.

## Articles — [`routers/articles.py`](../../src/lexflow/api/routers/articles.py)

### `GET /api/v1/laws/{law_id}/articles`

Paginated list of articles for a law.

| Query param | Type | Default |
|-------------|------|---------|
| `page` | int ≥ 1 | 1 |
| `page_size` | int 1–100 | 20 |

Response: `PaginatedResponse[Article]`.

### `GET /api/v1/laws/{law_id}/articles/{article_number}`

Single article. Numbers are normalised — trailing `.` and leading
`Artículo`/`Articulo` are stripped before matching.

Response: `ArticleResponse` — `{ law_id, law_title, article }`.

## Versions — [`routers/versions.py`](../../src/lexflow/api/routers/versions.py)

Reads the git history of the law file inside the `legalize-es` submodule.

### `GET /api/v1/laws/{law_id}/versions`

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `max_count` | int | 1–200 | 50 |

Response: `list[LawVersion]`, newest first. Each version carries
`commit_hash`, `date`, `message`, plus parsed `Norma` / `Disposición` /
`Artículos afectados` git trailers.

### `GET /api/v1/laws/{law_id}/diff?from=<sha>&to=<sha>`

Unified diff between two commits for the law file. Query params use the
`from` / `to` aliases (the Python-side names are `from_commit` /
`to_commit` per Sprint 7 api-10).

Response: `LawDiff` — `{ law_id, from_commit, to_commit, diff_text, stats }`.

## Search — [`routers/search.py`](../../src/lexflow/api/routers/search.py)

### `GET /api/v1/laws/search`

Full-text search across titles + article bodies. Canonical path; the
older `/api/v1/search` is kept as a deprecated alias (carries the
`Deprecation: true` response header) until v2.

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `q` | str | 2–200 chars | — (required) |
| `page` | int ≥ 1 | | 1 |
| `page_size` | int | 1–100 | 20 |

Response: `SearchResponse` — `{ query, total, items[], page, page_size }`
with `SearchResult { law_id, law_title, article_number, snippet, match_start, match_end, score }`.

### `GET /api/v1/laws/search/semantic`  *(#43 / #369)*

Cosine over per-article embeddings. Today's backend uses a placeholder
`HashEmbedder` (SHA-256 → unit-length 384-dim vector) — the real
embedder (sentence-transformers or remote) drops in via the
`Embedder` ABC defined in `core/search/embedder.py`.

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `q` | str | 2–200 chars | — (required) |
| `limit` | int | 1–50 | 10 |

Response: `SemanticSearchResponse` — `{ items[], total }`
with `SemanticSearchResult { law_id, article_number, snippet, score }`.

### `GET /api/v1/search` *(deprecated alias)*

Same shape as `/laws/search` but returns the `Deprecation: true`
header. Kept for back-compat until v2.

## Graph — [`routers/graph.py`](../../src/lexflow/api/routers/graph.py)

The graph is built lazily on first hit (singleton cached at module
scope) by calling `build_graph(registry)`. Node + edge attributes are
documented in [graph.md](graph.md).

### `GET /api/v1/graph`  *(#146 / #358)*

Whole-corpus view (no seed). Walks every node, applies metadata
filters, optionally truncates to the top-`limit` by PageRank, returns
the induced subgraph (edges only between selected nodes).

| Query param | Type | Range | Default | Notes |
|-------------|------|-------|---------|-------|
| `status` | `LawStatus` | — | — | `in_force`, `repealed`, `partially_repealed` |
| `rank` | `LawRank` | — | — | Same vocabulary as `/laws` |
| `scope` | `Scope` | — | — | `Estatal`, `Autonómico`, `Local` |
| `jurisdiction` | str | — | — | `es`, `es-md`, … |
| `limit` | int \| null | 1–50 000 | `null` (return all) | Top-N by PageRank when set |

Response: `GraphGlobalResponse` — `{ nodes[], edges[], total_available }`.
`total_available` is the pre-truncation count so the SPA can render
"showing N of M".

### `GET /api/v1/graph/neighbors/{law_id}`

Direct outgoing references.

Response: `GraphNeighborsResponse` — `{ law_id, neighbors[], count }`.

### `GET /api/v1/graph/path?from=<id>&to=<id>`

Shortest directed path. Returns 404 if no path or either node missing.
Query params use the `from` / `to` aliases.

Response: `GraphPathResponse` — `{ path: list[str] }`.

### `GET /api/v1/graph/subgraph/{law_id}?depth=N`

Ego subgraph (both successors and predecessors) up to `depth` hops.

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `depth` | int | 1–3 | 1 |

Response: `GraphSubgraphResponse` — `{ nodes[], edges[] }`. Each edge
carries `kind` (cites / modifies / repeals / develops, #144).

### `GET /api/v1/graph/stats`

Response: `GraphStatsResponse` — `{ node_count, edge_count, density,
weakly_connected_components }`.

### `GET /api/v1/graph/top?limit=N`

Top-N laws by PageRank. (The metric param was dropped in Sprint 6
api-7 — only PageRank is supported today.)

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `limit` | int | 1–100 | 10 |

Response: `GraphTopResponse` — `{ items: [GraphTopItem(law_id, score, title), ...] }`.

## Tags — [`routers/tags.py`](../../src/lexflow/api/routers/tags.py)

### `GET /api/v1/tags`

Normalised tag vocabulary across the corpus.

Response: `TagsResponse` — `{ items: [TagCount(tag, count), ...] }`.

## Dashboards — [`routers/dashboards.py`](../../src/lexflow/api/routers/dashboards.py)

### `GET /api/v1/dashboards/{preset}`

Plotly figures as JSON. Preset is a `Literal["compliance", "analytics"]`.

Response: `DashboardPayload` — `{ preset, kpi[], main_series, generated_at }`.

## Sync — [`routers/sync.py`](../../src/lexflow/api/routers/sync.py)

### `POST /api/v1/sync`

Run `git pull` against the `legalize-es` submodule and refresh registry
+ graph state. Returns 200 + body indicating whether the action was
`noop` / `incremental` / `rebuild`.

## Chat threads — [`routers/chat_threads.py`](../../src/lexflow/api/routers/chat_threads.py)

Persisted chat conversations (issue #83). Storage is SQLite via
SQLModel; see [chat-and-mcp.md](chat-and-mcp.md).

### `GET /api/v1/chat/threads`

Paginated list, newest activity first.

| Query param | Type | Default |
|-------------|------|---------|
| `page` | int ≥ 1 | 1 |
| `page_size` | int 1–100 | 20 |

Response: `ChatThreadList`.

### `POST /api/v1/chat/threads`

Create a new thread. Body: `ChatThreadCreate { title?, model? }`. Returns
201 + `ChatThreadRead`.

### `GET /api/v1/chat/threads/{thread_id}`

Read a thread plus its full message history.

Response: `ChatThreadDetail`.

### `PATCH /api/v1/chat/threads/{thread_id}`

Rename a thread (only `title` is patchable today). 400 on empty patch.

Response: `ChatThreadRead`.

### `DELETE /api/v1/chat/threads/{thread_id}`

Delete a thread and all its messages (cascade). **Idempotent** (Sprint 5
api-3): returns 204 whether the row existed or not.

### `POST /api/v1/chat/threads/{thread_id}/messages`

Append one message. Body: `ChatMessageCreate { role, content, payload? }`.
Returns 201 + `ChatMessageRead` and sets `Location:
/api/v1/chat/threads/{thread_id}/messages/{message_id}` per Sprint 6 api-5.

### `POST /api/v1/chat/threads/{thread_id}/send`

Stream an assistant reply (SSE) — the agentic loop (#195) drives this:
text deltas, tool-call events when the provider asks for a tool,
source events when a tool result carries citations, finally a
`done` event. Rate-limited per cloud provider via #93. Pre-stream 429
when the bucket runs dry; pre-stream 404 when the thread is missing.

Body: `ChatSendRequest { message, model }`.

## Models — [`routers/models.py`](../../src/lexflow/api/routers/models.py)

### `GET /api/v1/models`

Every chat model the user can pick across all providers — local
(Ollama, LM Studio) + cloud (OpenAI, Anthropic, Google). Cloud
providers without a configured key surface as `available: false`.

Response: `list[ModelInfo]`.

### `POST /api/v1/models/pull`

Stream Ollama's `pull` progress as SSE so the wizard can render real
progress (issue #119). Body: `{ model_id }`. Events: `progress`,
`done`, `error`.

## System — [`routers/system.py`](../../src/lexflow/api/routers/system.py)

### `GET /api/v1/system/warmup`  *(#222)*

Background warm-up progress. Polled by the SPA's `SplashGate` during
startup until `ready: true`.

Response: `WarmupStatusResponse` — `{ ready, metadata_ready,
search_ready, graph_ready, error, durations_seconds }`.

### `GET /api/v1/system/whats-new?since=<sha>`  *(#228)*

Corpus diff since the given commit. Returns empty lists on first
launch (`since` absent) or when the diff is unavailable.

Response: `WhatsNewResponse`.

### `GET /api/v1/system/profile`  *(#117)*

Host hardware + local LLM provider detection — consumed by the model
wizard. Bounded at ~700 ms; not for polling.

Response: `SystemProfileResponse`.

### `GET /api/v1/system/health`  *(#330)*

Extended health snapshot. Unlike the unprefixed `/health` (which stays
a one-liner for liveness probes), this runs every probe and returns
the full picture.

Response: `HealthSnapshot` — `{ status, version, uptime_seconds,
memory{ rss_mb, system_used_percent }, disk{ path, total_gb, used_gb,
free_gb, used_percent }, corpus{ submodule_present, laws_indexed },
chat_db{ reachable } }`. `status` is `"ok"` or `"degraded"`.

## MCP — [`routers/mcp_servers.py`](../../src/lexflow/api/routers/mcp_servers.py)

### `GET /api/v1/mcp/servers`  *(#122)*

List built-in + user-added MCP server configurations.

Response: `McpServerListResponse`.

### `POST /api/v1/mcp/servers`

Add a user server (Claude Desktop schema). 409 on name collision with
a built-in or existing user entry.

Body: `McpServerCreateRequest`. Returns 201 + `McpServerView`.

### `PATCH /api/v1/mcp/servers/{name}`

Toggle the `enabled` flag on a user server.

### `DELETE /api/v1/mcp/servers/{name}`

Idempotent delete. 409 when targeting a built-in.

### `GET /api/v1/mcp/tools`  *(#121 / #364)*

Merged tool catalogue across every enabled external MCP server.
In-process built-in tools (`search_law`, `get_law`, `get_article`,
`get_stats`) are NOT included — they're dispatched directly by the
agentic loop. A server that fails to connect is silently skipped.

Response: `McpToolListResponse` — `{ items: [{ server_name, name,
qualified_name, description }, ...] }`.

### `POST /api/v1/mcp/bundles`  *(#123 / #365)*

Install a `.mcpb` bundle (Anthropic Desktop Extensions). Multipart
upload with a single `file` field. 50 MB upload cap; per-member 25 MB
cap; zip-slip rejected. 409 on name collision.

Returns 201 + `McpServerView`.

## Secrets — [`routers/secrets.py`](../../src/lexflow/api/routers/secrets.py)  *(#120 / #362)*

Cloud-provider API keys live in the OS keyring (Credential Manager /
Keychain / Secret Service). The keys themselves are **never** echoed
on the wire.

### `GET /api/v1/secrets`

List which providers are configured (booleans only).

Response: `SecretStatusResponse` — `{ items: [{ provider, configured }, ...] }`.

### `POST /api/v1/secrets`

Store a key. Body: `{ provider, api_key }`. Returns 204; empty `api_key`
is rejected with 422 (Pydantic `min_length=1`); unknown provider with 400.

### `DELETE /api/v1/secrets/{provider}`

Idempotent 204. Env vars (`OPENAI_API_KEY`, etc.) are NOT touched —
they live outside this surface.

## Telemetry — [`routers/telemetry.py`](../../src/lexflow/api/routers/telemetry.py)  *(#331)*

Two-gate opt-in: backend env `LEXFLOW_TELEMETRY_ENABLED=1` AND the
SPA's user toggle (Zustand `telemetryConsent`). Events only flow when
both are on.

### `GET /api/v1/telemetry/status`

Read the backend gate.

Response: `TelemetryStatus` — `{ enabled: bool }`.

### `POST /api/v1/telemetry/events`

Submit a batch (max 50). Always returns 202; the body says how many
were actually persisted.

Body: `TelemetryBatch { events: [{ name, props }, ...] }`.
Response: `TelemetryIngestResponse` — `{ accepted, enabled }`.

## Operational

### `GET /health`

`{ "status": "ok", "version": "<x.y.z>" }`. Not under `/api/v1`; lives
at root, used by docker / k8s / uvicorn liveness probes. Stays cheap
on purpose — the extended snapshot is at `/api/v1/system/health`.

### `GET /docs`, `/redoc`, `/openapi.json`

FastAPI's built-in documentation surfaces — always live in dev. The
SPA's typed client is generated from `/openapi.json` via
`openapi-typescript` (run `npm run generate:api` from `frontend/`).
