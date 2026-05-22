# Pages and Routing

LexFlow uses **React Router v6** (`react-router-dom`). The full route table
lives in [`frontend/src/App.tsx`](../../frontend/src/App.tsx); each route maps
to a single page file under
[`frontend/src/pages/`](../../frontend/src/pages/).

## Route table

| Path | Page file | Notes |
|------|-----------|-------|
| `/`                          | [`HomePage.tsx`](../../frontend/src/pages/HomePage.tsx)             | Landing dashboard. |
| `/onboarding`                | [`OnboardingPage.tsx`](../../frontend/src/pages/OnboardingPage.tsx) | First-launch gate, **rendered outside** `AppShell`. |
| `/explorer`                  | [`ExplorerPage.tsx`](../../frontend/src/pages/ExplorerPage.tsx)     | Filterable list of laws (status / rango / ambito / tags). |
| `/laws/:lawId`               | [`LawDetailPage.tsx`](../../frontend/src/pages/LawDetailPage.tsx)   | Hierarchy + article reader for one law. |
| `/laws/:lawId/diff`          | [`DiffPage.tsx`](../../frontend/src/pages/DiffPage.tsx)             | Version-to-version diff for one law. |
| `/graph`                     | [`GraphPage.tsx`](../../frontend/src/pages/GraphPage.tsx)           | Knowledge-graph canvas. |
| `/chat`                      | [`ChatPage.tsx`](../../frontend/src/pages/ChatPage.tsx)             | Chat home (no thread selected). |
| `/chat/:threadId`            | [`ChatPage.tsx`](../../frontend/src/pages/ChatPage.tsx)             | Chat with a specific thread loaded. |
| `/dashboards`                | [`DashboardPage.tsx`](../../frontend/src/pages/DashboardPage.tsx)   | Default preset (compliance). |
| `/dashboards/:preset`        | [`DashboardPage.tsx`](../../frontend/src/pages/DashboardPage.tsx)   | `:preset` is `compliance` or `analytics`. |
| `/search`                    | [`SearchResultsPage.tsx`](../../frontend/src/pages/SearchResultsPage.tsx) | Read `?q=` from the query string. |
| `/settings`                  | [`SettingsPage.tsx`](../../frontend/src/pages/SettingsPage.tsx)     | General settings. |
| `/settings/:section`         | [`SettingsPage.tsx`](../../frontend/src/pages/SettingsPage.tsx)     | Deep-link to a section tab. |
| `*` (inside shell)           | [`NotFoundPage.tsx`](../../frontend/src/pages/NotFoundPage.tsx)     | In-shell 404. |
| `*` (outside shell)          | `<Navigate to="/" replace />`                                       | Fallback for unmatched roots. |

## Layout: `AppShell`

Every route except `/onboarding` is nested under
[`AppShell`](../../frontend/src/components/shell/AppShell.tsx) via React
Router's layout-route pattern:

```tsx
<Route element={<AppShell />}>
  <Route index element={<HomePage />} />
  <Route path="explorer" element={<ExplorerPage />} />
  {/* ... */}
</Route>
```

`AppShell` mounts the `LeftRail`, `TopBar`, `RightRail`, and `CommandPalette`,
then renders the active page through `<Outlet />`. See
[component-library.md](./component-library.md) for each shell piece.

## Redirects and 404 handling

- Any unmatched path that reaches the shell layout renders `NotFoundPage`
  (in-shell 404 — left rail and top bar stay visible).
- Any unmatched path **outside** the shell (e.g. typos like `/onbording`)
  is caught by the final `<Route path="*" element={<Navigate to="/" replace />} />`
  and bounces to `/`. The first match wins, so this only triggers when the
  shell layout itself never mounted.

## Adding a new page

1. Create `frontend/src/pages/<Name>Page.tsx`. Export the page as a named
   export (`export function <Name>Page()`).
2. Add a `<Route>` inside the `AppShell` layout in
   [`App.tsx`](../../frontend/src/App.tsx). Put dynamic segments **after** the
   static ones (`laws/:lawId` after `laws/index`, etc.).
3. If the page needs nav presence, add an entry in
   [`LeftRail.tsx`](../../frontend/src/components/shell/LeftRail.tsx).
4. If it should be reachable from `Ctrl+K`, add it in
   [`CommandPalette.tsx`](../../frontend/src/components/shell/CommandPalette.tsx).
5. For data, prefer a TanStack Query hook in
   [`lib/queries.ts`](../../frontend/src/lib/queries.ts) — see
   [state-and-data.md](./state-and-data.md).

Pages must not own routing logic beyond their own contents — global redirects
live in `App.tsx`, not in `useEffect` blocks inside the pages.
