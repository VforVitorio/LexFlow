/**
 * Single source of truth for the legal-graph node palette.
 *
 * Used by:
 * - `components/domain/GraphCanvas.tsx` (node fills + selection halo)
 * - `pages/GraphPage.tsx`               (legend + filter chips)
 * - `pages/DashboardPage.tsx`           (sparkline + bar accents)
 *
 * Before this module the same five HSL strings lived inline in three
 * places; the audit (`memory/feedback_*` if added) flagged it as
 * drift-prone. Touch the palette here and everything follows.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * New node kind         → extend `GraphNodeKind` in `lib/types.ts` and
 *                           add a colour here. TypeScript will fail any
 *                           consumer that forgets to handle the new kind.
 * * Recolour brand        → swap the HSL string here; consumers update
 *                           automatically.
 * * Tailwind / CSS tokens → if these become CSS variables in
 *                           `index.css`, switch this module to read
 *                           `hsl(var(--graph-law))` and friends.
 */

import type { GraphEdge, GraphNodeKind } from './types';

/**
 * Edge kinds that the backend ships on `GraphEdge.kind` (#144). Mirrors
 * the union in `lib/types.ts` so this module remains the single
 * source of truth for the graph palette.
 */
export type GraphEdgeKind = NonNullable<GraphEdge['kind']>;

/**
 * Display label per node kind. Spanish on purpose — these are
 * legal-taxonomy categories (Ley / Artículo / …), kept untranslated like
 * rango/ámbito (see the i18n convention). Lives here, next to
 * `GRAPH_KIND_FILL`, so the canvas and the page share one source and the
 * canvas file stays a pure component module (react-refresh).
 */
export const NODE_KIND_LABELS: Record<GraphNodeKind, string> = {
  law: 'Ley',
  article: 'Artículo',
  reference: 'Referencia',
  amendment: 'Reforma',
  repealed: 'Derogada',
};

/** Solid fill per node kind. */
export const GRAPH_KIND_FILL: Record<GraphNodeKind, string> = {
  law:       'hsl(232 72% 52%)', // indigo — primary anchor
  article:   'hsl(36 95% 56%)',  // amber  — accent / recent
  reference: 'hsl(266 65% 60%)', // violet
  amendment: 'hsl(195 70% 50%)', // cyan
  repealed:  'hsl(220 8% 55%)',  // neutral grey
};

/**
 * Brand indigo used for selection state, edge highlight and the bar /
 * sparkline charts. Same hue as `GRAPH_KIND_FILL.law` so the focus
 * accent visually pairs with the law nodes.
 */
export const GRAPH_PRIMARY = 'hsl(232 72% 52%)';

/**
 * Selection halo (large soft circle behind the focused node). 18 %
 * alpha so it reads as "there but not loud".
 */
export const GRAPH_PRIMARY_SOFT = 'hsl(232 72% 52% / 0.18)';

/** Outer glow on the selected node — slightly stronger than the halo. */
export const GRAPH_PRIMARY_GLOW = 'hsl(232 72% 52% / 0.55)';

/**
 * Translucent fill below sparkline / area-chart strokes (10 % alpha).
 * Same hue as :data:`GRAPH_PRIMARY` so charts and graph nodes read as
 * the same product.
 */
export const GRAPH_PRIMARY_FILL_SOFT = 'hsl(232 72% 52% / 0.10)';

/**
 * Stroke colour per edge kind. Hue grouped so an edge reads the same
 * "family" as the destination node when possible:
 * - ``cites``     → neutral indigo (links between norms, the bread-and-butter case)
 * - ``develops``  → cyan (downstream regulation/RD that develops a law)
 * - ``modifies``  → amber (mutates the target; same hue as ``article`` to flag change)
 * - ``repeals``   → red (destructive; only colour outside the existing palette)
 *
 * Falls back to ``border-strong`` (existing default) when the backend
 * omits ``kind`` (legacy edges from before #144).
 */
export const GRAPH_EDGE_STROKE: Record<GraphEdgeKind, string> = {
  cites:    'hsl(232 60% 60%)', // indigo (light)
  develops: 'hsl(195 65% 55%)', // cyan (matches `amendment` node)
  modifies: 'hsl(36 90% 55%)',  // amber (matches `article` node)
  repeals:  'hsl(0 70% 55%)',   // red
};

/**
 * Spanish-first display label per edge kind. Used by the canvas legend
 * and any tooltip / filter chip that lists edge kinds.
 */
export const EDGE_KIND_LABELS: Record<GraphEdgeKind, string> = {
  cites:    'Cita',
  develops: 'Desarrolla',
  modifies: 'Modifica',
  repeals:  'Deroga',
};
