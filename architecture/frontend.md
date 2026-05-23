# Frontend architecture

Source: [`frontend/src/`](../../frontend/src/). Bundler: Vite. Framework:
React 18 + TypeScript.

> The frontend is mid-bootstrap. Pages and components are written, but the
> `src/lib/` data layer they import from has not been committed yet. See
> [running-locally.md](../getting-started/running-locally.md#mode-2--frontend-only-mock-data)
> for the current state.

## Layout

```
frontend/
├── src/
│   ├── main.tsx              Bootstraps React, QueryClient, BrowserRouter
│   ├── App.tsx               <Routes> definition
│   ├── index.css             Tailwind layers + CSS variables (HSL tokens)
│   ├── components/
│   │   ├── BrandMark.tsx     Logo
│   │   ├── ui/               Primitives — Button, Badge, Tabs, …
│   │   ├── shell/            App chrome — AppShell, LeftRail, TopBar, CommandPalette
│   │   └── domain/           Legal-specific — LawHeader, ArticleBlock, GraphCanvas, …
│   ├── pages/                One file per route (HomePage, ExplorerPage, …)
│   └── lib/                  (planned) api.ts, queries.ts, store.ts, utils.ts
├── public/
├── index.html
├── package.json
├── vite.config.ts            Alias '@'→src, dev proxy /api → :8000
├── tailwind.config.ts        Design tokens
├── tsconfig.json
└── .env.example
```

## State split

LexFlow follows the rule from [`CLAUDE.md` §7](../../CLAUDE.md):

| Kind of state | Tool |
|---------------|------|
| Server data (laws, articles, search results, chat history) | TanStack Query |
| Client UI state (theme, panel toggles, palette open, density) | Zustand |

They never mix. A TanStack Query result is **never** copied into a Zustand
store.

The Zustand store is referenced from [`AppShell`](../../frontend/src/components/shell/AppShell.tsx),
[`LeftRail`](../../frontend/src/components/shell/LeftRail.tsx),
[`TopBar`](../../frontend/src/components/shell/TopBar.tsx), and
[`CommandPalette`](../../frontend/src/components/shell/CommandPalette.tsx) as
`useUi` from `@/lib/store`. The store implementation file is pending — see
[state-and-data.md](../frontend/state-and-data.md).

## Routing

[`App.tsx`](../../frontend/src/App.tsx) uses React Router v6 with one shell
layout (`<AppShell />`) wrapping all main pages and a flat `/onboarding`
gate. See [pages-and-routing.md](../frontend/pages-and-routing.md) for the
full table.

## Styling

Tailwind, configured in [`tailwind.config.ts`](../../frontend/tailwind.config.ts).
Design tokens live as HSL-triple CSS variables in
[`index.css`](../../frontend/src/index.css). Light/dark is toggled by setting
`data-theme` on `<html>` from the Zustand store — no class-based dark mode.

## Keyboard model

Defined inline in [`AppShell.tsx`](../../frontend/src/components/shell/AppShell.tsx):

| Shortcut | Action |
|----------|--------|
| `⌘ K` / `Ctrl K` | Command palette |
| `⌘ /` | Toggle right rail |
| `⌘ \` | Toggle left rail |
| `⌘ .` | Toggle theme |
| `g h` / `g e` / `g g` / `g c` / `g d` / `g s` | Go to Home / Explorer / Graph / Chat / Dashboards / Settings |

Implemented via two custom hooks (`useHotkey`, `useGoToHotkey`) in
`@/lib/hotkeys` (pending).

## API contract (frontend view)

Currently lives in [`frontend/README.md`](../../frontend/README.md) and in the
JSDoc of `src/lib/api.ts` (pending file). The expected paths there
(`/api/laws`, `/api/laws/{id}/...`) diverge from the live backend (`/api/v1/laws`).
The wiring task is to reconcile the two — see
[api-client.md](../frontend/api-client.md) for the discrepancy.

## Build

```bash
pnpm dev          # Vite dev server on :5173 with HMR
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint
pnpm build        # tsc --noEmit && vite build  →  frontend/dist/
pnpm preview      # serve the built bundle
```

## Where things live

| You want to change… | Edit |
|---------------------|------|
| A route | `src/App.tsx` |
| Sidebar items | `src/components/shell/LeftRail.tsx:NAV` |
| A design token | `src/index.css` (CSS variables) or `tailwind.config.ts` |
| A primitive look (Button, Badge…) | `src/components/ui/<Name>.tsx` |
| A domain widget | `src/components/domain/<Name>.tsx` |
| A page | `src/pages/<Name>Page.tsx` |
| Data fetching hook | `src/lib/queries.ts` (pending) |
| UI store key | `src/lib/store.ts` (pending) |
