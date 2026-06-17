# Frontend architecture

Source: [`frontend/src/`](../../frontend/src/). Bundler: Vite. Framework:
React 18 + TypeScript.

Verified against release 0.58.x.

## Layout

```
frontend/
├── src/
│   ├── main.tsx              Bootstraps React, QueryClient, BrowserRouter, i18next
│   ├── App.tsx               <Routes> definition (react-router-dom)
│   ├── index.css             Tailwind layers + CSS variables (HSL tokens)
│   ├── i18n/
│   │   ├── index.ts          i18next + LanguageDetector setup
│   │   └── locales/{es,en}/common.json
│   ├── api/
│   │   └── schema.ts         Generated from /openapi.json (openapi-typescript)
│   ├── components/
│   │   ├── BrandMark.tsx     Logo
│   │   ├── ui/               Primitives — Button, Badge, Tabs, Card, …
│   │   ├── shell/            App chrome — AppShell, LeftRail, TopBar, BottomTabBar,
│   │   │                     CommandPalette, ErrorBoundary, Toaster
│   │   └── domain/           Legal-specific — LawHeader, GraphCanvas, McpServersSection,
│   │                          ModelWizard, HelpDrawer, TutorialTour, …
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── ExplorerPage.tsx + explorer/FilterRail.tsx
│   │   ├── LawDetailPage.tsx
│   │   ├── DiffPage.tsx
│   │   ├── GraphPage.tsx
│   │   ├── ChatPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── SearchResultsPage.tsx
│   │   ├── OnboardingPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── stores/               (Zustand stores)
│   └── lib/
│       ├── api.ts            Switch between liveApi (real backend) and api.mock
│       ├── api.mock.ts       In-memory mock fixtures
│       ├── api/              Live-client modules per resource (laws, graph, chat, …)
│       ├── queries.ts        TanStack Query hooks (useLaw, useGraph, useHealth, …)
│       ├── store.ts          Zustand UI store (theme, density, telemetryConsent, …)
│       ├── greeting.ts       Welcome-flow + nameless-greeting helpers
│       ├── hotkeys.ts        useHotkey + useGoToHotkey
│       ├── toast.ts          Imperative toast() + Toaster mount
│       ├── types.ts          Shared TypeScript types (HealthSnapshot, Law, …)
│       └── utils.ts          cn(), timeAgo(), …
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
| Server data (laws, articles, search, chat history, health, telemetry status, …) | TanStack Query (via `lib/queries.ts`) |
| Client UI state (theme, density, palette open, telemetry consent, default model, …) | Zustand (`useUi` from `lib/store.ts`, persisted to `localStorage[lexflow.ui]`) |

They never mix. A TanStack Query result is **never** copied into the Zustand
store.

## Routing

[`App.tsx`](../../frontend/src/App.tsx) uses **React Router DOM v6** with one
shell layout (`<AppShell />`) wrapping the main pages and flat top-level
routes for `/onboarding`. The CLAUDE.md tech-stack table mentions TanStack
Router as the aspirational choice; the live codebase uses
`react-router-dom`. See [pages-and-routing.md](../frontend/pages-and-routing.md)
for the full route table.

## Internationalisation

`react-i18next` + `i18next-browser-languagedetector`. Dictionaries live under
[`src/i18n/locales/{es,en}/common.json`](../../frontend/src/i18n/locales/).
Spanish is the default fallback; English is the second locale. ES↔EN parity
is enforced by a Vitest guard (#339). User language preference persists in
`localStorage[lexflow.lang]` and the toggle lives in **Settings →
Personalización**.

## Styling

Tailwind, configured in [`tailwind.config.ts`](../../frontend/tailwind.config.ts).
Design tokens live as HSL-triple CSS variables in
[`index.css`](../../frontend/src/index.css). Light/dark is toggled by setting
`data-theme` on `<html>` from the Zustand store — no class-based dark mode.

## Keyboard model

Defined inline in [`AppShell.tsx`](../../frontend/src/components/shell/AppShell.tsx)
and implemented via `useHotkey` / `useGoToHotkey` in
[`lib/hotkeys.ts`](../../frontend/src/lib/hotkeys.ts):

| Shortcut | Action |
|----------|--------|
| `⌘ K` / `Ctrl K` | Command palette |
| `⌘ /` | Toggle right rail |
| `⌘ \` | Toggle left rail |
| `⌘ .` | Toggle theme |
| `g h` / `g e` / `g g` / `g c` / `g d` / `g s` | Go to Home / Explorer / Graph / Chat / Dashboards / Settings |

## API contract (frontend view)

[`lib/api.ts`](../../frontend/src/lib/api.ts) picks between the real backend
(`liveApi`) and the in-memory mock (`api.mock.ts`) based on `VITE_USE_MOCK`.
The real client lives under [`lib/api/`](../../frontend/src/lib/api/) with
one file per resource (laws, articles, graph, search, chat, models, sync,
system, …). Each method:

1. Calls `http<BackendShape>(path)` (the typed `ky` wrapper in
   [`lib/api/http.ts`](../../frontend/src/lib/api/http.ts)).
2. Flips snake_case wire fields into camelCase SPA fields via
   `transformers.ts` where the mapping is non-trivial.

Type generation: `npm run generate:api` re-runs `openapi-typescript` against
the live backend's `/openapi.json` and writes `src/api/schema.ts`. CI does
not yet enforce that `schema.ts` matches the backend.

## Build

```bash
npm install            # first time
npm run dev            # Vite dev server on :5173 with HMR
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run test -- --run  # Vitest
npm run build          # tsc --noEmit && vite build  →  frontend/dist/
npm run preview        # serve the built bundle
```

## Where things live

| You want to change… | Edit |
|---------------------|------|
| A route | `src/App.tsx` |
| Sidebar items | `src/components/shell/nav-items.tsx:NAV` |
| Design tokens | `src/index.css` (CSS variables) or `tailwind.config.ts` |
| A primitive (Button, Badge…) | `src/components/ui/<Name>.tsx` |
| A domain widget | `src/components/domain/<Name>.tsx` |
| A page | `src/pages/<Name>Page.tsx` |
| Data fetching hook | `src/lib/queries.ts` |
| UI store key | `src/lib/store.ts` |
| Live API call | `src/lib/api/<resource>.ts` |
| Mock fixtures | `src/lib/api.mock.ts` + `src/lib/mock-data.ts` |
| Add an i18n key | `src/i18n/locales/{es,en}/common.json` (must add to both) |
| Settings tab | `src/pages/SettingsPage.tsx:SECTIONS` array + matching section component |
