# API Client

The frontend talks to the FastAPI backend through a single typed surface:
[`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts). Two
implementations sit behind one interface — live HTTP and an in-process mock —
so feature work never has to wait for a backend endpoint to land.

## Types — `lib/types.ts`

The full shape catalogue is in
[`frontend/src/lib/types.ts`](../../frontend/src/lib/types.ts). The shapes the
rest of the app depends on:

| Type | What it represents |
|------|--------------------|
| `Law`           | List-row law: id, BOE id, title, short alias, `status`, `rango`, `ambito`, counts (`articulos`, `referencias`, `versiones`), optional tags. |
| `LawDetail`     | `Law` plus a `hierarchy: HierarchyNode[]` tree. |
| `HierarchyNode` | One node in the law tree (`titulo`, `libro`, `capitulo`, `seccion`, `articulo`, `disposicion`) with optional children. |
| `Article`       | `id` (`${lawId}::${num}`), `lawId`, `num`, `titulo`, `body: ArticleClause[]`, `refs: ArticleRef[]`. |
| `ArticleClause` | A paragraph: `marker`, `text`, inline `citations`. |
| `ArticleRef`    | Citation handle: `label`, optional `target` (`lawId`, `articleNum`), optional `kind`. |
| `LawVersion`    | A version on the legalize-es git history: `tag`, `date`, `label`, `kind` (`publish`, `amend`, `consolidate`, `repeal`), optional `changedArticles`. |
| `DiffResult`    | One law diff: `from`/`to` versions, `articles: ArticleDiff[]`, totals. |
| `ArticleDiff`   | Per-article diff (`left`/`right` sides + totals). |
| `GraphData`     | `{ nodes: GraphNode[]; edges: GraphEdge[] }`. |
| `ChatThread`, `ChatMessage`, `ChatChunk` | Chat conversation, persisted message, and SSE chunk. |
| `Model`         | `{ id, label, vendor, kind: 'cloud' \| 'local', available }`. |
| `SyncStatus`    | legalize-es upstream state: `lastSyncAt`, `behind`, `busy`. |
| `SearchResults` | `{ hits: SearchHit[]; total }`. |
| `DashboardData` | Preset, cards, time-series. |
| `Paginated<T>`  | `{ items, total, cursor }`. |

The full `ApiClient` interface lives at the bottom of `types.ts`. Both clients
implement it method-for-method.

## `ApiClient` and `ApiError`

`api.ts` exports the active client as `api` (a singleton). It also exports
both implementations (`liveApi`, `mockApi`) for tests and Storybook.

`ApiError` is the only error type ever thrown by the client:

```ts
export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) { ... }
  get detail(): string { /* reads FastAPI's `{ detail }` if present */ }
}
```

Components consume errors uniformly through `.detail` (see
[`ErrorState.tsx`](../../frontend/src/components/domain/ErrorState.tsx)).

## Live HTTP client

`liveApi` calls the backend through a tiny `http<T>(path, init)` helper:

- Base URL  = `import.meta.env.VITE_API_URL` (empty for same-origin).
- Prefix    = `/api/v1` (versioning lives here, not in each method).
- Errors    → `ApiError` with `status` and parsed JSON body.

## Domain transformers

The backend uses snake_case and a slightly different vocabulary than the UI
(`in_force` vs `vigente`, `real_decreto` vs `Real Decreto`, ...). All mapping
is centralised in `api.ts`:

| Helper | Purpose |
|--------|---------|
| `transformLaw`        | `BackendLawSummary → Law` (applies `RANK_MAP`, `STATUS_MAP`, `SCOPE_MAP`; derives `short` via `buildShortName`). |
| `transformLawDetail`  | Wraps `transformLaw` and builds the `hierarchy` via `sectionToHierarchy`. |
| `transformArticle`    | `BackendArticle → Article` (single-clause body until per-paragraph parsing lands). |
| `transformVersion`    | `BackendLawVersion → LawVersion` (derives `kind` from the commit message). |
| `transformDiff`       | Parses the unified diff string into one `ArticleDiff` until per-article diffs land. |

If the backend changes a field name, fix it here — never in the components.

## Mock fallback — `VITE_USE_MOCK`

```ts
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
export const api: ApiClient = USE_MOCK ? mockApi : liveApi;
```

- `VITE_USE_MOCK` unset or `'true'` → mock client
  ([`api.mock.ts`](../../frontend/src/lib/api.mock.ts) backed by
  [`mock-data.ts`](../../frontend/src/lib/mock-data.ts)).
- `VITE_USE_MOCK='false'`           → live HTTP client.

Toggle it in `.env.local` or via the Settings page. The Settings page reads
`USE_MOCK` from this module to display the active mode.

## Extending the client

| Situation | Right move |
|-----------|------------|
| Backend already returns the data you need — UI just doesn't render it. | Extend `types.ts` (add the field), update the relevant `transform*` to surface it. |
| Frontend needs a new shape the backend doesn't return yet. | Add an endpoint on the backend first (see [backend/api-endpoints.md](../backend/api-endpoints.md)), then add a `transform*` and a method on `liveApi`, then a query hook. |
| You want one-off fake data for a feature in progress. | Extend `mockApi` only and keep `VITE_USE_MOCK=true` until the backend catches up. Methods not yet implemented on `liveApi` reject with `ApiError(501, ...)` referencing the tracking issue. |

Do **not** call `fetch` from a component — every network call must go through
`api`. This keeps the mock toggle and the error contract honest.
