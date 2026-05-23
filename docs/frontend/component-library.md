# Component Library

The frontend lives under [`frontend/src/components/`](../../frontend/src/components/)
and splits into three layers: **`ui/`** primitives, **`shell/`** layout, and
**`domain/`** components that know about laws, articles, citations, and the
knowledge graph.

Routing of the layout is described in
[pages-and-routing.md](./pages-and-routing.md); data wiring in
[state-and-data.md](./state-and-data.md).

---

## `ui/` — generic primitives

Stateless, unstyled-by-default, no knowledge of the domain. Reuse anywhere.
Re-exported from [`components/ui/index.ts`](../../frontend/src/components/ui/index.ts).

| Component | Description | Path |
|-----------|-------------|------|
| `Avatar`   | Round image / initials block for users and threads. | [`Avatar.tsx`](../../frontend/src/components/ui/Avatar.tsx) |
| `Badge`    | Coloured pill for status (`vigente`, `derogada`, ...). | [`Badge.tsx`](../../frontend/src/components/ui/Badge.tsx) |
| `Button`   | Variants: `primary`, `secondary`, `ghost`, `danger`, `link`. Loading + icon slots. | [`Button.tsx`](../../frontend/src/components/ui/Button.tsx) |
| `Callout`  | Inline notice block (info / warn / error). | [`Callout.tsx`](../../frontend/src/components/ui/Callout.tsx) |
| `Card`     | Rounded surface with padding; building block for panels. | [`Card.tsx`](../../frontend/src/components/ui/Card.tsx) |
| `Checkbox` | Controlled checkbox with label. | [`Checkbox.tsx`](../../frontend/src/components/ui/Checkbox.tsx) |
| `Chip`     | Removable tag pill, used for active filters. | [`Chip.tsx`](../../frontend/src/components/ui/Chip.tsx) |
| `Input`    | Single-line text input with optional icon. | [`Input.tsx`](../../frontend/src/components/ui/Input.tsx) |
| `Kbd`      | Renders a keystroke (`Ctrl+K`). | [`Kbd.tsx`](../../frontend/src/components/ui/Kbd.tsx) |
| `Radio`    | Single-choice option in a group. | [`Radio.tsx`](../../frontend/src/components/ui/Radio.tsx) |
| `Switch`   | On/off toggle for settings. | [`Switch.tsx`](../../frontend/src/components/ui/Switch.tsx) |
| `Tabs`     | Tab list with controlled active tab. | [`Tabs.tsx`](../../frontend/src/components/ui/Tabs.tsx) |

---

## `shell/` — application layout

The persistent chrome that wraps every routed page (except `/onboarding`).

| Component | Description | Path |
|-----------|-------------|------|
| `AppShell`       | Outer layout: left rail, top bar, `<Outlet/>`, right rail, command palette. | [`AppShell.tsx`](../../frontend/src/components/shell/AppShell.tsx) |
| `LeftRail`       | Primary nav (Home, Explorer, Graph, Chat, Dashboards, Settings). Collapsible. | [`LeftRail.tsx`](../../frontend/src/components/shell/LeftRail.tsx) |
| `TopBar`         | Global search field, sync state, theme toggle, model chip. | [`TopBar.tsx`](../../frontend/src/components/shell/TopBar.tsx) |
| `RightRail`      | Context panel for the current page (citations, version meta, graph node info). | [`RightRail.tsx`](../../frontend/src/components/shell/RightRail.tsx) |
| `CommandPalette` | `Ctrl+K` overlay with recent laws, navigation, theme actions. | [`CommandPalette.tsx`](../../frontend/src/components/shell/CommandPalette.tsx) |

---

## `domain/` — LexFlow-specific blocks

These import from `@/lib/types` and assume legal-corpus semantics.

| Component | Description | Path |
|-----------|-------------|------|
| `ArticleBlock`    | Renders one `Article` with paragraph markers and inline citation handles. | [`ArticleBlock.tsx`](../../frontend/src/components/domain/ArticleBlock.tsx) |
| `ChatMessage`     | Renders one user / assistant / tool turn including streaming state. | [`ChatMessage.tsx`](../../frontend/src/components/domain/ChatMessage.tsx) |
| `CitationCard`    | Right-rail card surfacing a `ChatSource` (law, article, snippet). | [`CitationCard.tsx`](../../frontend/src/components/domain/CitationCard.tsx) |
| `DiffViewer`      | Side-by-side `ArticleDiff` viewer with add / del / eq line styling. | [`DiffViewer.tsx`](../../frontend/src/components/domain/DiffViewer.tsx) |
| `EmptyState`      | Placeholder for "no results" / "pick a law" / "start a thread". | [`EmptyState.tsx`](../../frontend/src/components/domain/EmptyState.tsx) |
| `ErrorState`      | Renders an `ApiError` (reads `.detail`) with a retry action. | [`ErrorState.tsx`](../../frontend/src/components/domain/ErrorState.tsx) |
| `GraphCanvas`     | Force-directed `GraphData` visualisation (nodes + edges, kind-coloured). | [`GraphCanvas.tsx`](../../frontend/src/components/domain/GraphCanvas.tsx) |
| `LawHeader`       | Law detail header: title, rango, ambito, status badge, counts. | [`LawHeader.tsx`](../../frontend/src/components/domain/LawHeader.tsx) |
| `ModelChip`       | Compact chip showing the active chat model and provider. | [`ModelChip.tsx`](../../frontend/src/components/domain/ModelChip.tsx) |
| `VersionTimeline` | Vertical list of `LawVersion`s with kind icons; selects from/to for diff. | [`VersionTimeline.tsx`](../../frontend/src/components/domain/VersionTimeline.tsx) |

---

## When to add a `ui/` primitive vs a `domain/` component

Add to `ui/` when **all** of these hold:

- The component does not import from `@/lib/types` or `@/lib/api`.
- It would be at home in any web app (a `Tooltip`, a `Slider`).
- It carries no copy in Spanish or legal vocabulary.

Add to `domain/` when **any** of these hold:

- It speaks `Law`, `Article`, `LawVersion`, `GraphData`, `ChatMessage`, ...
- It renders Spanish labels or legal status enums.
- It calls a TanStack Query hook from
  [`lib/queries.ts`](../../frontend/src/lib/queries.ts) (queries belong with
  the component that consumes them — see
  [state-and-data.md](./state-and-data.md)).

If a primitive starts gaining domain-specific props, split it: keep the
generic shell in `ui/` and lift the legal logic into a `domain/` wrapper.
