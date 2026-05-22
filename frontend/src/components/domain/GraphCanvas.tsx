import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { GraphData, GraphNode, GraphNodeKind } from '@/lib/types';

export const NODE_KIND_LABELS: Record<GraphNodeKind, string> = {
  law: 'Ley',
  article: 'Artículo',
  reference: 'Referencia',
  amendment: 'Reforma',
  repealed: 'Derogada',
};

const KIND_FILL: Record<GraphNodeKind, string> = {
  law:       'hsl(232 72% 52%)',
  article:   'hsl(36 95% 56%)',
  reference: 'hsl(266 65% 60%)',
  amendment: 'hsl(195 70% 50%)',
  repealed:  'hsl(220 8% 55%)',
};

export interface GraphCanvasProps {
  data: GraphData;
  visibleKinds: Set<GraphNodeKind>;
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

const SIZE = { law: 28, article: 18, reference: 16, amendment: 16, repealed: 18 } as Record<GraphNodeKind, number>;

/**
 * Lightweight SVG graph. For dense (>1k nodes) graphs swap this for
 * `@xyflow/react` — the wiring (data + selection + visibleKinds) stays the
 * same. See README "Swap to react-flow".
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ TODO · FUTURE WORK · Obsidian-style graph
 * ─────────────────────────────────────────────────────────────────────
 *
 * This component is a *placeholder* renderer that lays out a fixed seed
 * set of nodes from `mock-data.ts`. To match the experience the user
 * actually wants (Obsidian-grade), we still need:
 *
 *   1. Force-directed simulation (d3-force or @xyflow/react's layout helpers)
 *      with adjustable repulsion / link strength / center gravity exposed
 *      as Tweaks. Persist the simulation position so the layout doesn't
 *      jump after every navigation.
 *
 *   2. Smooth pan + pinch-zoom (Obsidian-style), inertial scrolling,
 *      double-click-to-focus on a node which re-centers the camera with
 *      a 320ms spring (already in our motion vocabulary).
 *
 *   3. Hover preview card — when the cursor lingers on a node, fade in
 *      a popover with the law title, BOE id, a 2-line summary and
 *      first 3 #tags. Esc / mouse-out cancels.
 *
 *   4. Depth slider in the toolbar: 1-hop, 2-hop, 3-hop neighbourhoods
 *      around the selected node. Default 2.
 *
 *   5. Tag-driven hue: when the user has active tag filters, nodes that
 *      carry a tag flash the tag's deterministic colour on the ring;
 *      Obsidian's local-graph trick.
 *
 *   6. Local-graph mode: when invoked from a LawDetail page (`/laws/:id`),
 *      render the local neighbourhood of that node, not the global graph.
 *
 *   7. Performance budget: 1.000 nodes at 60fps. The current SVG path is
 *      fine up to ~150 nodes; beyond that switch to canvas + an offscreen
 *      worker for layout.
 *
 * Keep this component's *public API* (props + the selected/visibleKinds
 * contract) stable so the upgrade lands without touching `GraphPage.tsx`
 * or any of its consumers.
 * ─────────────────────────────────────────────────────────────────────
 */
export function GraphCanvas({ data, visibleKinds, selected, onSelect, className }: GraphCanvasProps) {
  const W = 920, H = 560;
  const visible = useMemo(() => new Set(data.nodes.filter((n) => visibleKinds.has(n.kind)).map((n) => n.id)), [data, visibleKinds]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={cn('size-full select-none', className)}>
      <defs>
        <pattern id="lf-dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="hsl(var(--border))" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#lf-dots)" />

      {/* Edges */}
      {data.edges.map((e) => {
        const a = data.nodes.find((n) => n.id === e.source);
        const b = data.nodes.find((n) => n.id === e.target);
        if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) return null;
        const v = visible.has(a.id) && visible.has(b.id);
        const sel = a.id === selected || b.id === selected;
        return (
          <line
            key={e.id}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={sel ? 'hsl(232 72% 52%)' : 'hsl(var(--border-strong))'}
            strokeWidth={sel ? 2 : 1}
            opacity={v ? (sel ? 1 : 0.55) : 0.1}
            style={sel ? { filter: 'drop-shadow(0 0 4px hsl(232 72% 52% / 0.5))' } : undefined}
          />
        );
      })}

      {/* Nodes */}
      {data.nodes.map((n) => <Node key={n.id} node={n} selected={n.id === selected} visible={visible.has(n.id)} onSelect={onSelect} />)}
    </svg>
  );
}

function Node({ node, selected, visible, onSelect }: { node: GraphNode; selected: boolean; visible: boolean; onSelect: (id: string) => void }) {
  if (node.x == null || node.y == null) return null;
  const r = SIZE[node.kind];
  const fill = KIND_FILL[node.kind];
  const dim = !visible || node.dim;
  return (
    <g
      onClick={() => onSelect(node.id)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(node.id); }}
      role="button"
      aria-label={`${NODE_KIND_LABELS[node.kind]}: ${node.label}`}
      style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1 }}
    >
      {selected && (
        <circle cx={node.x} cy={node.y} r={r + 8} fill="hsl(232 72% 52% / 0.18)">
          <animate attributeName="r" values={`${r+6};${r+14};${r+6}`} dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.2;0.5" dur="2.2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={node.x} cy={node.y} r={r} fill={fill} stroke={selected ? 'hsl(var(--bg))' : 'transparent'} strokeWidth={selected ? 3 : 0} />
      {node.kind === 'law' && (
        <circle cx={node.x} cy={node.y} r={r - 5} fill="none" stroke="hsl(var(--bg))" strokeOpacity={0.45} strokeWidth={1.5} />
      )}
      <text
        x={node.x} y={node.y + r + 14}
        textAnchor="middle" fontSize={11} fontFamily='"JetBrains Mono", monospace'
        fontWeight={selected ? 600 : 500}
        fill="hsl(var(--fg))"
        style={{ pointerEvents: 'none' }}
      >{node.label}</text>
    </g>
  );
}
