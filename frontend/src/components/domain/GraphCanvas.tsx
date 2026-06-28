/**
 * Knowledge-graph canvas — force-directed WebGL-class view (#596).
 *
 * Replaces the react-flow DOM/SVG radial layout (which looked flat and
 * couldn't scale past a few hundred nodes) with `react-force-graph-2d`:
 * a single HTML5 canvas + d3-force simulation. Handles thousands of nodes
 * at 60 fps, Obsidian-style.
 *
 * Public API (props + onSelect contract) is unchanged so `GraphPage.tsx`
 * doesn't move.
 *
 * Design notes:
 * * `graphData` is memoised on `data` ONLY — selection and kind-filter
 *   changes must NOT rebuild it, or the simulation restarts on every
 *   click. Dim + selection state are read live inside the paint closures.
 * * Labels are drawn only for the selected node or when zoomed past
 *   `LABEL_ZOOM` — this kills the label-overlap soup at default zoom (#569).
 * * Colours come from `lib/graph-colors.ts` (literal HSL strings, so the
 *   canvas can use them directly — CSS `var(--x)` would not resolve here).
 *   The label colour is the one theme token we resolve at runtime.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Palette        → `lib/graph-colors.ts`.
 * * Node sizing    → `BASE_RADIUS` + `nodeRadius`.
 * * Label density  → `LABEL_ZOOM`.
 * * Forces         → the `d3Force` tweaks in the mount effect.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

import { GRAPH_EDGE_STROKE, GRAPH_KIND_FILL, GRAPH_PRIMARY } from '@/lib/graph-colors';
import type { GraphData, GraphEdge, GraphNodeKind } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface GraphCanvasProps {
  data: GraphData;
  visibleKinds: Set<GraphNodeKind>;
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/** Node shape fed to the force engine (it mutates x/y/vx/vy in place). */
interface FGNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  pagerank: number;
  x?: number;
  y?: number;
}

interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
  kind?: NonNullable<GraphEdge['kind']>;
}

/** Base node radius (graph units) per kind; laws anchor, the rest ring them. */
const BASE_RADIUS: Record<GraphNodeKind, number> = {
  law: 7,
  article: 4.5,
  reference: 4.5,
  amendment: 4.5,
  repealed: 5,
};

const LABEL_ZOOM = 1.3;
const DIM_ALPHA = 0.18;

function nodeRadius(node: FGNode): number {
  const base = BASE_RADIUS[node.kind] ?? 4.5;
  // PageRank within a subgraph is tiny (sums to 1); scale generously but cap.
  return base + Math.min(7, node.pagerank * 45);
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Append an alpha to a literal ``hsl(h s% l%)`` string for canvas use. */
function withAlpha(hsl: string, alpha: number): string {
  return hsl.replace(')', ` / ${alpha})`);
}

export function GraphCanvas({ data, visibleKinds, selected, onSelect, className }: GraphCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // `reduced` starts from the current OS preference but updates at runtime
  // when the user toggles reduced-motion in system settings (see the
  // matchMedia change-listener effect below).
  const [reduced, setReduced] = useState(prefersReducedMotion);

  // Stable across selection + filter changes (depends on `data` only) so the
  // simulation never restarts on a click or a chip toggle.
  const graphData = useMemo(() => {
    const nodes = data.nodes.map(
      (n): FGNode => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        pagerank: typeof n.meta?.pagerank === 'number' ? n.meta.pagerank : 0,
      }),
    );
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = data.edges.map((e): FGLink => ({ source: e.source, target: e.target, kind: e.kind }));
    return { nodes, links, byId };
  }, [data]);

  // The label colour is theme-dependent (`--fg`); the canvas can't read CSS
  // vars, so resolve it once. Re-reads on remount; good enough for v1.
  const labelColor = useMemo(() => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
      return v ? `hsl(${v})` : '#9aa0aa';
    } catch {
      return '#9aa0aa';
    }
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Viewport visibility, tracked in state so the single animation-control
  // effect below can compose it with reduced-motion. CodeRabbit #725: two
  // effects toggling `fgRef` independently let the last event win (a
  // reduced-motion change could resume an offscreen graph, and vice-versa).
  // Defaults to true so the graph animates until proven offscreen.
  const [onScreen, setOnScreen] = useState(true);

  /**
   * Track whether the canvas is in the viewport. Only updates state — the
   * combined effect below decides whether to actually pause/resume.
   */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries[0].isIntersecting),
      // root:null (viewport); threshold 0 = toggle at fully offscreen / any re-entry.
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Track runtime changes to the OS reduced-motion preference. Only updates
   * state; the combined effect applies it. Changing `reduced` also re-renders,
   * updating `warmupTicks`/`cooldownTicks` on `<ForceGraph2D>` for subsequent
   * data changes.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  /**
   * Single source of truth for the force-graph animation: run it only when the
   * canvas is on-screen AND reduced-motion is off. Composing both conditions
   * here — rather than toggling `fgRef` from each listener — stops them from
   * fighting (a reduced-motion change can't resume an offscreen graph).
   *
   * Risk: if the simulation hasn't settled when paused (scrolled away early),
   * the layout freezes mid-computation and resumes from there on return; the
   * first zoom-to-fit (`onEngineStop`) fires only once the engine finally stops.
   */
  useEffect(() => {
    const shouldAnimate = onScreen && !reduced;
    if (shouldAnimate) {
      fgRef.current?.resumeAnimation();
    } else {
      fgRef.current?.pauseAnimation();
    }
  }, [onScreen, reduced]);

  const isVisible = useCallback((kind: GraphNodeKind) => visibleKinds.has(kind), [visibleKinds]);
  const resolve = (end: string | FGNode): FGNode | undefined =>
    typeof end === 'object' ? end : graphData.byId.get(end);

  return (
    <div ref={wrapperRef} className={cn('size-full', className)}>
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          // Reduced-motion: pre-settle off-screen (warmup) then freeze. Normal:
          // animate the settle over a bounded number of ticks.
          warmupTicks={reduced ? 150 : 0}
          cooldownTicks={reduced ? 0 : 200}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 56)}
          enableNodeDrag={false}
          minZoom={0.4}
          maxZoom={6}
          nodeRelSize={1}
          onNodeClick={(n) => onSelect((n as FGNode).id)}
          onBackgroundClick={() => {
            if (selected) onSelect('');
          }}
          linkColor={(l) => {
            const link = l as FGLink;
            const s = resolve(link.source);
            const t = resolve(link.target);
            const dim = (s != null && !isVisible(s.kind)) || (t != null && !isVisible(t.kind));
            const base = link.kind ? GRAPH_EDGE_STROKE[link.kind] : 'hsl(220 9% 50%)';
            return withAlpha(base, dim ? 0.06 : 0.5);
          }}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={(n, ctx, scale) => {
            const node = n as FGNode;
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const r = nodeRadius(node);
            const visible = isVisible(node.kind);
            const isSel = node.id === selected;

            ctx.save();
            ctx.globalAlpha = visible ? 1 : DIM_ALPHA;

            if (isSel) {
              ctx.beginPath();
              ctx.arc(x, y, r + 5, 0, 2 * Math.PI);
              ctx.fillStyle = withAlpha(GRAPH_PRIMARY, 0.18);
              ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = GRAPH_KIND_FILL[node.kind];
            ctx.fill();
            if (isSel) {
              ctx.lineWidth = 2 / scale;
              ctx.strokeStyle = GRAPH_PRIMARY;
              ctx.stroke();
            }

            if (visible && (isSel || scale > LABEL_ZOOM)) {
              const fontSize = 12 / scale;
              ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = labelColor;
              const label = node.label.length > 42 ? `${node.label.slice(0, 41)}…` : node.label;
              ctx.fillText(label, x, y + r + 2 / scale);
            }
            ctx.restore();
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            const node = n as FGNode;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      )}
    </div>
  );
}
