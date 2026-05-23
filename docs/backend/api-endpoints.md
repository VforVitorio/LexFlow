# API endpoints

Every endpoint lives under `/api/v1/`. Sources: [`src/lexflow/api/routers/`](../../src/lexflow/api/routers/).
Models referenced below are documented in [core-models.md](core-models.md) and
the response wrappers in [`core/schemas.py`](../../src/lexflow/core/schemas.py).

## Laws — [`routers/laws.py`](../../src/lexflow/api/routers/laws.py)

### `GET /api/v1/laws`

Paginated list with optional filters.

| Query param | Type | Default | Notes |
|-------------|------|---------|-------|
| `page` | int ≥ 1 | 1 | |
| `page_size` | int 1-100 | 20 | |
| `rank` | `LawRank` | — | `ley`, `ley_organica`, `real_decreto`, … |
| `status` | `LawStatus` | — | `in_force`, `repealed`, `partially_repealed`, `pending` |
| `scope` | `Scope` | — | `Estatal`, `Autonómico`, `Local` |
| `jurisdiction` | str | — | `es`, `es-md`, `es-ct`, … |

Response: `PaginatedResponse[LawSummary]`.

### `GET /api/v1/laws/{law_id}`

Full parsed law. Triggers a full-file parse on first hit; cached thereafter.

Response: `LawDetail` (metadata, sections, articles, references, article_count).

## Articles — [`routers/articles.py`](../../src/lexflow/api/routers/articles.py)

### `GET /api/v1/laws/{law_id}/articles`

Paginated list of articles for a law.

| Query param | Type | Default |
|-------------|------|---------|
| `page` | int ≥ 1 | 1 |
| `page_size` | int 1-100 | 20 |

Response: `PaginatedResponse[Article]`.

### `GET /api/v1/laws/{law_id}/articles/{article_number}`

Single article. Article numbers are normalised — trailing `.` and leading
`Artículo`/`Articulo` are stripped before matching.

Response: `ArticleResponse` — `{ law_id, law_title, article }`.

## Versions — [`routers/versions.py`](../../src/lexflow/api/routers/versions.py)

Reads the git history of the law file inside the `legalize-es` submodule.

### `GET /api/v1/laws/{law_id}/versions`

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `max_count` | int | 1-200 | 50 |

Response: `list[LawVersion]`, newest first. Each version carries
`commit_hash`, `date`, `message`, plus parsed `Norma` / `Disposición` /
`Artículos afectados` git trailers from the commit body.

### `GET /api/v1/laws/{law_id}/diff?from=<sha>&to=<sha>`

Unified diff between two commits for the law file.

Response: `LawDiff` — `{ law_id, from_commit, to_commit, diff_text, stats }`
with `DiffStats { additions, deletions, changed_articles }`.

## Search — [`routers/search.py`](../../src/lexflow/api/routers/search.py)

### `GET /api/v1/search`

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `q` | str | 2-200 chars | — (required) |
| `page` | int ≥ 1 | | 1 |
| `page_size` | int | 1-100 | 20 |

Full-text across titles + article bodies (only law titles are indexed for
laws that have not been fully parsed yet — the index grows as cache fills).

Response: `SearchResponse` — `{ query, total, items[], page, page_size }`
with `SearchResult { law_id, law_title, article_number, snippet, score }`.

## Graph — [`routers/graph.py`](../../src/lexflow/api/routers/graph.py)

The graph is built lazily on first hit (singleton cached at module scope) by
calling `build_graph(registry)`.

### `GET /api/v1/graph/neighbors/{law_id}`

Direct outgoing references.

Response: `GraphNeighborsResponse` — `{ law_id, neighbors[], count }`.

### `GET /api/v1/graph/path?from_id=<id>&to_id=<id>`

Shortest directed path. Returns `404` if no path exists or either node is
missing.

Response: `list[str]` of node IDs.

### `GET /api/v1/graph/subgraph/{law_id}?depth=N`

Ego subgraph (both successors and predecessors) up to `depth` hops.

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `depth` | int | 1-3 | 1 |

Response: `GraphSubgraphResponse` — `{ nodes[], edges[] }`.

### `GET /api/v1/graph/stats`

Response: `GraphStatsResponse` — `{ node_count, edge_count, density,
weakly_connected_components }`.

### `GET /api/v1/graph/top?n=N`

Top-N laws by PageRank.

| Query param | Type | Range | Default |
|-------------|------|-------|---------|
| `n` | int | 1-100 | 10 |

Response: `list[GraphTopItem]` — `{ law_id, score, title }`.

## Operational

### `GET /health`

`{ "status": "ok", "version": "<x.y.z>" }`. Not under `/api/v1`; lives at
root. Used by [`docker-compose.yml`](../../docker-compose.yml) healthcheck.

### `GET /docs`, `/redoc`, `/openapi.json`

FastAPI's built-in documentation surfaces — always live.

## Mismatches with the frontend mock contract

[`frontend/README.md`](../../frontend/README.md) advertises some paths that
do **not** exist on the backend yet:

| Mock path | Backend reality |
|-----------|-----------------|
| `GET /api/laws` | `GET /api/v1/laws` (versioned prefix) |
| `GET /api/chat/threads`, `/threads/{id}/send` | not implemented |
| `GET /api/models` | not implemented |
| `GET /api/dashboards/{preset}` | not implemented (figures only produced in Python) |
| `GET /api/sync/status`, `POST /api/sync/run` | not implemented |
| `GET /api/laws/{id}/references`, `/api/laws/{id}/graph` | not implemented; closest is `/api/v1/graph/neighbors/{id}` |

When wiring the live client, prefer the real backend paths and adapt the
frontend types — not the other way around.
