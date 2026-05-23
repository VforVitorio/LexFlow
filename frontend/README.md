# LexFlow — Frontend

> Spanish legislation, alive and navigable. React + TypeScript + Vite frontend
> for a FastAPI backend that serves the [`legalize-es`](https://github.com/legalize-es) corpus.

## Stack

| Concern              | Choice                                                  |
| -------------------- | ------------------------------------------------------- |
| Framework            | React 18 + TypeScript                                   |
| Bundler / dev server | Vite                                                    |
| Styling              | Tailwind CSS (tokens in `tailwind.config.ts`)         |
| Data fetching        | TanStack Query                                          |
| Routing              | React Router v6                                         |
| State (UI prefs)     | Zustand (persisted to localStorage)                     |
| Icons                | lucide-react                                            |
| Graph                | inline SVG today, ready to swap to `@xyflow/react`    |

## Layout

```
src/
├── components/
│   ├── ui/          ← primitives (Button, Badge, Input, Tabs…)
│   ├── shell/       ← AppShell, LeftRail, TopBar, CommandPalette
│   └── domain/      ← LawHeader, ArticleBlock, DiffViewer, GraphCanvas…
├── pages/           ← one file per route — Home, Explorer, LawDetail, Diff…
├── lib/
│   ├── api.ts       ← typed HTTP client (the swap point)
│   ├── api.mock.ts  ← in-process mock implementation
│   ├── mock-data.ts ← Spanish-law seed data used by api.mock
│   ├── types.ts     ← domain types + ApiClient interface
│   ├── queries.ts   ← TanStack Query hooks (useLaw, useDiff, …)
│   ├── store.ts     ← Zustand UI store (theme, panels, density)
│   ├── hotkeys.ts   ← ⌘K / go-to navigation
│   └── utils.ts     ← cn, formatters, modKey
└── main.tsx / App.tsx
```

## Run it

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev          # http://localhost:5173 — mock data by default
```

## Wire to your FastAPI backend

1. Implement the routes listed inline in [`src/lib/api.ts`](src/lib/api.ts). Expected paths:

| Method | Path                                    | Response             |
| ------ | --------------------------------------- | -------------------- |
| GET    | `/api/laws`                           | `Paginated<Law>`   |
| GET    | `/api/laws/{id}`                      | `LawDetail`        |
| GET    | `/api/laws/{id}/versions`             | `LawVersion[]`     |
| GET    | `/api/laws/{id}/diff?from&to`         | `DiffResult`       |
| GET    | `/api/laws/{id}/references`           | `Article[]`        |
| GET    | `/api/laws/{id}/articles/{num}`       | `Article`          |
| GET    | `/api/laws/{id}/graph?depth`          | `GraphData`        |
| GET    | `/api/search?q`                       | `SearchResults`    |
| GET    | `/api/chat/threads`                   | `ChatThread[]`     |
| GET    | `/api/chat/threads/{id}`              | `ChatMessage[]`    |
| POST   | `/api/chat/threads/{id}/send`         | SSE stream of `ChatChunk` |
| GET    | `/api/models`                         | `Model[]`          |
| GET    | `/api/dashboards/{preset}`            | `DashboardData`    |
| GET    | `/api/sync/status`                    | `SyncStatus`       |
| POST   | `/api/sync/run`                       | 204                  |

2. Match the response shapes in [`src/lib/types.ts`](src/lib/types.ts). If the
   backend uses snake_case, do the rename inside the `transformLaw`-style
   helpers in `api.ts` — the rest of the app stays clean.

3. Flip the env flag:

```bash
# .env.local
VITE_API_URL=http://localhost:8000
VITE_USE_MOCK=false
```

The Vite dev server proxies `/api` to `VITE_API_URL`, so no CORS for development.

### Chat streaming (SSE)

The chat endpoint is expected to emit Server-Sent Events. Each `data:` line is
a JSON `ChatChunk`:

```text
event: chunk
data: {"type":"tool_call","name":"search_corpus","args":{"q":"..."}}

event: chunk
data: {"type":"text","delta":"La **LOPDGDD** se apoya en el RGPD..."}

event: chunk
data: {"type":"source","source":{...}}

event: done
data: {"type":"done"}
```

`api.chat.send` returns an `AsyncIterable<ChatChunk>`; the page's reducer
`applyChunk` in `api.mock.ts` is the reference implementation for folding
chunks into an assistant message — reuse it from the live client.

## Design tokens

All visual primitives sit in [`tailwind.config.ts`](tailwind.config.ts) and
[`src/index.css`](src/index.css). Light + dark live on `<html data-theme>`,
flipped by the Zustand store. Editing one of the HSL channel triples in
`index.css` recolours the entire app.

## Keyboard map

| Shortcut          | Effect                       |
| ----------------- | ---------------------------- |
| `⌘ K` / `Ctrl K` | Command palette            |
| `⌘ /`             | Toggle right rail          |
| `⌘ \\`            | Toggle left rail           |
| `⌘ .`             | Toggle theme               |
| `g h` / `g e` / `g g` / `g c` / `g d` / `g s` | Go to Inicio / Explorador / Grafo / Chat / Cuadros / Ajustes |
| `j` / `k`        | Next / previous diff change |

## Swap to react-flow

`src/components/domain/GraphCanvas.tsx` is a small SVG renderer; for the
1.000-node performance budget, replace its body with `@xyflow/react` (already
in `package.json`):

```tsx
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
```

The page-level state (filters, selected, hover) stays unchanged — pass the
same `nodes` / `edges` after mapping `{ id, source, target }` to react-flow's
shape.

## Accessibility

- Focus rings always visible on keyboard navigation (`:focus-visible` is never
  removed; see `index.css`).
- Every interactive non-button widget exposes an `aria-label`.
- The skip-link at the top of `AppShell` jumps focus to `#main`.
- `prefers-reduced-motion` is respected (animation durations capped to 0.01ms
  on opt-out).

## Roadmap (not implemented yet)

- Article-level streaming load on the LawDetail page (currently we batch).
- Universal search hits for chat threads and dashboards.
- Settings → Updates (channel switcher, check-for-updates).
- Landing / marketing page (out of scope for the app itself).
