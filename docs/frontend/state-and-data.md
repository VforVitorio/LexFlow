# State and Data

LexFlow splits client state on a hard line:

- **UI state** (theme, layout, preferences) → [Zustand](https://zustand.docs.pmnd.rs/)
  store at [`lib/store.ts`](../../frontend/src/lib/store.ts).
- **Server state** (laws, articles, graph, chat, search) →
  [TanStack Query](https://tanstack.com/query) hooks in
  [`lib/queries.ts`](../../frontend/src/lib/queries.ts).

**Never mix server state into Zustand.** A `Law` in Zustand is a stale copy
waiting to disagree with the cache. Keep server data inside the query cache
and let components subscribe via hooks.

## Zustand UI store

Defined in [`lib/store.ts`](../../frontend/src/lib/store.ts) as `useUi`.
Components read it with selectors:

```ts
const theme = useUi((s) => s.theme);
const toggleLeft = useUi((s) => s.toggleLeft);
```

### Slices

| Field | Type | Purpose |
|-------|------|---------|
| `theme`         | `'light' \| 'dark'` | Mirrored to `<html data-theme>` via a `subscribe` side-effect at module load. Initial value follows `prefers-color-scheme`. |
| `leftExpanded`  | `boolean`           | Left rail expanded vs. icon-only. |
| `rightOpen`     | `boolean`           | Right rail visible. |
| `density`       | `'compact' \| 'comfortable' \| 'cozy'` | Table density (Explorer). |
| `readingSize`   | `number`            | Law-detail font size, clamped to `14..22`. |
| `paletteOpen`   | `boolean`           | `Ctrl+K` palette. **Not persisted.** |
| `defaultModel`  | `string`            | Chat model id; default from `VITE_DEFAULT_MODEL`. |

### Persistence

The store uses the `persist` middleware with `name: 'lexflow.ui'`. The
`partialize` config writes **only** these keys to `localStorage`:

```
theme, leftExpanded, rightOpen, density, readingSize, defaultModel
```

`paletteOpen` and any future transient flag stay in memory only — a reload
should not leave the palette stuck open.

## TanStack Query

All server reads go through the hooks in
[`lib/queries.ts`](../../frontend/src/lib/queries.ts). They wrap the singleton
`api` exported by [`lib/api.ts`](../../frontend/src/lib/api.ts) — see
[api-client.md](./api-client.md).

### Cache keys

The `qk` factory at the top of `queries.ts` is the single source of truth for
keys. Use it instead of hand-writing arrays so renames stay safe:

```ts
queryKey: qk.laws.detail(id);             // ['laws', 'detail', id]
queryKey: qk.graph(id, depth);            // ['graph', id, 2]
queryKey: qk.dashboard('compliance');     // ['dashboard', 'compliance']
```

### `staleTime` decisions

| Resource | `staleTime` | Rationale |
|----------|-------------|-----------|
| `useLawsList`  | `30_000`     | Filter/sort changes happen often; 30 s avoids refetch flicker while typing. |
| `useLaw`       | `60_000`     | Law details rarely change within a session. |
| `useTags`      | `5 * 60_000` | Tag vocabulary is corpus-wide; minutes are fine. |
| `useSearch`    | `10_000`     | Query string changes drive most invalidation; keep fresh. |
| `useModels`    | `5 * 60_000` | Model list is local-config driven, almost static. |
| `useSyncStatus`| `refetchInterval: 60_000` | Pollling for legalize-es upstream progress. |

When in doubt, omit `staleTime` and accept the default (`0`).

### Mutations

The only mutation today is `useRunSync` — it calls `api.sync.run()` and
invalidates `qk.sync()` on success so the next `useSyncStatus` poll picks up
the new state. Use this pattern for any future write: mutate, then invalidate
the specific keys touched (not the entire cache).

## Where each store lives

```
frontend/src/lib/
  store.ts     ← Zustand: theme, panels, density, defaultModel
  queries.ts   ← TanStack Query hooks + qk factory
  api.ts       ← HTTP client + transforms (read by queries)
  api.mock.ts  ← In-process mock matching ApiClient
  types.ts     ← Shared TS types
```

If you need a piece of state that is neither a user preference nor backend
data (e.g. the currently selected graph node), prefer **local component
state** first. Promote to Zustand only when two unrelated routes need to
share it.
