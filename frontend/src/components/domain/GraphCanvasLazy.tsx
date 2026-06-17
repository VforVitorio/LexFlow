/**
 * Lazy boundary for {@link GraphCanvas} so `react-force-graph-2d` (a heavy
 * canvas + d3-force bundle) loads only when a graph actually renders — not in
 * the cold-start entry chunk (#555). LawDetailPage is an eager route, so a
 * static import of GraphCanvas dragged the whole viz stack into the initial
 * payload; routing it through this boundary keeps it on demand.
 *
 * Type-only import of the props keeps this file from pulling the runtime.
 */
import { Suspense, lazy } from 'react';

import type { GraphCanvasProps } from './GraphCanvas';

const GraphCanvas = lazy(() => import('./GraphCanvas').then((m) => ({ default: m.GraphCanvas })));

export function GraphCanvasLazy(props: GraphCanvasProps) {
  return (
    <Suspense fallback={<div className="size-full" aria-hidden />}>
      <GraphCanvas {...props} />
    </Suspense>
  );
}
