import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node as RFNode,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { cn } from '@/lib/utils';
import { GRAPH_KIND_FILL, GRAPH_PRIMARY, GRAPH_PRIMARY_GLOW, GRAPH_PRIMARY_SOFT, NODE_KIND_LABELS } from '@/lib/graph-colors';
import type { GraphData, GraphNode, GraphNodeKind } from '@/lib/types';

/** Node size (px) per kind. Law nodes anchor the canvas; articles ring them. */
const KIND_SIZE: Record<GraphNodeKind, number> = {
  law: 56,
  article: 36,
  reference: 36,
  amendment: 36,
  repealed: 40,
};

export interface GraphCanvasProps {
  data: GraphData;
  visibleKinds: Set<GraphNodeKind>;
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * Obsidian-style graph canvas — closes #87.
 *
 * Replaces the original inline SVG with `@xyflow/react`. Public API
 * (props + onSelect contract) is unchanged so `GraphPage.tsx` doesn't
 * need to move.
 *
 * --- Layout ---
 * The backend doesn't ship node positions yet. We compute a deterministic
 * radial layout once per `data` reference: law-kind nodes anchor a small
 * inner ring; references / amendments sit on a middle ring; articles +
 * repealed go on the outer ring. The result is stable across renders
 * (no force-sim jiggling) and scales to a few hundred nodes per ring
 * before crowding becomes a problem — past that we'll swap to dagre or
 * d3-force per the follow-ups below.
 *
 * --- Performance ---
 * `onlyRenderVisibleElements` keeps off-screen nodes out of the React
 * tree during pan/zoom — required to hold 60 fps once the corpus has
 * thousands of laws (#87 acceptance criterion).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Color tokens             → ``lib/graph-colors.ts`` (shared with
 *                               ``GraphPage`` and ``DashboardPage``).
 * * Node size                 → ``KIND_SIZE`` above.
 * * Layout policy             → ``_layout`` below
 * * Node visual               → ``LfNode`` component
 *
 * --- FOLLOW-UPS (tracked in #87's parent epic) ---
 * 1. Force-directed simulation with adjustable repulsion / link strength
 * 2. Hover preview card (popover with title + first 3 tags)
 * 3. Depth slider (1-hop / 2-hop / 3-hop neighbourhood)
 * 4. Tag-driven hue ring
 * 5. Local-graph mode for ``/laws/:id`` pages
 *
 * The public API (props) stays stable through all of those.
 */

interface LfNodeData extends Record<string, unknown> {
  label: string;
  kind: GraphNodeKind;
  dim: boolean;
  selected: boolean;
  /** #143 — PageRank over the subgraph (0..1). Scales node size. */
  pagerank: number;
  onSelect: (id: string) => void;
}

/**
 * Map a node's PageRank to a px diameter on top of its base kind size.
 * PageRank within a subgraph is tiny (sums to 1 across all nodes), so we
 * scale generously: a node with 3× the mean rank reads visibly bigger
 * without the hubs ballooning off-screen.
 */
function sizeForNode(kind: GraphNodeKind, pagerank: number): number {
  const base = KIND_SIZE[kind];
  // +0..28px on top of the base, capped. 0.15 pagerank (a strong hub in a
  // ~15-node subgraph) hits the cap.
  const boost = Math.min(28, pagerank * 190);
  return Math.round(base + boost);
}

const LfNode = memo(function LfNode({ id, data }: NodeProps<RFNode<LfNodeData>>) {
  const { label, kind, dim, selected: isSelected, pagerank, onSelect } = data;
  const size = sizeForNode(kind, pagerank);
  const fill = GRAPH_KIND_FILL[kind];
  return (
    <button
      type="button"
      className={cn(
        'group relative grid place-items-center rounded-full transition-opacity',
        dim ? 'opacity-25' : 'opacity-100',
      )}
      style={{ width: size, height: size }}
      onClick={() => onSelect(id)}
      aria-label={`${NODE_KIND_LABELS[kind]}: ${label}`}
    >
      {/* Connection handles — `@xyflow/react` requires them on every node,
          even when edges connect arbitrarily. Hidden visually. */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      {isSelected && (
        <span
          aria-hidden
          className="absolute inset-[-10px] rounded-full"
          style={{ background: GRAPH_PRIMARY_SOFT }}
        />
      )}
      <span
        aria-hidden
        className="size-full rounded-full"
        style={{
          background: fill,
          boxShadow: isSelected ? `0 0 0 3px hsl(var(--bg)), 0 0 18px ${GRAPH_PRIMARY_GLOW}` : undefined,
        }}
      />
      {kind === 'law' && (
        <span
          aria-hidden
          className="absolute size-[60%] rounded-full"
          style={{ border: '1.5px solid hsl(var(--bg) / 0.55)' }}
        />
      )}
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-fg"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: isSelected ? 600 : 500 }}
      >
        {label}
      </span>
    </button>
  );
});

const NODE_TYPES = { lf: LfNode } as const;

/**
 * Cheap-and-deterministic radial layout. We compute it once per
 * `nodes` reference (memoised by the caller) and feed the positions
 * straight into react-flow.
 *
 * Picking radii by kind keeps the visual story clear at a glance
 * (laws in the centre, articles on the outside) without needing a
 * force-sim warmup pass.
 */
function _layout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const buckets: Record<GraphNodeKind, GraphNode[]> = {
    law: [], article: [], reference: [], amendment: [], repealed: [],
  };
  for (const node of nodes) buckets[node.kind].push(node);

  const ringRadius: Record<GraphNodeKind, number> = {
    law: 180,
    reference: 320,
    amendment: 320,
    article: 460,
    repealed: 460,
  };
  // The inner ring rotates slightly so the law that opened the page sits
  // at the top — same trick Obsidian uses to "anchor" the focused node.
  const ringOffset: Record<GraphNodeKind, number> = {
    law: -Math.PI / 2,
    reference: -Math.PI / 2 + 0.25,
    amendment: -Math.PI / 2 - 0.25,
    article: -Math.PI / 2,
    repealed: -Math.PI / 2 + Math.PI,
  };

  for (const kind of Object.keys(buckets) as GraphNodeKind[]) {
    const bucket = buckets[kind];
    if (bucket.length === 0) continue;
    const r = ringRadius[kind];
    const offset = ringOffset[kind];
    for (let i = 0; i < bucket.length; i++) {
      const node = bucket[i];
      // Prefer backend-supplied positions when present — once the API
      // ships node coords (issue #146), this branch carries them straight
      // through.
      if (node.x != null && node.y != null) {
        positions.set(node.id, { x: node.x, y: node.y });
        continue;
      }
      const angle = offset + (i * 2 * Math.PI) / bucket.length;
      positions.set(node.id, {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      });
    }
  }
  return positions;
}

function GraphCanvasInner({ data, visibleKinds, selected, onSelect, className }: GraphCanvasProps) {
  const visibleSet = useMemo(
    () => new Set(data.nodes.filter((n) => visibleKinds.has(n.kind)).map((n) => n.id)),
    [data, visibleKinds],
  );
  const layout = useMemo(() => _layout(data.nodes), [data]);

  // Avoid re-allocating react-flow node/edge arrays just because `selected`
  // changed — we read `selected` inside `LfNode` through the data prop.
  const flowNodes = useMemo<RFNode<LfNodeData>[]>(
    () =>
      data.nodes.map((n) => {
        const pos = layout.get(n.id) ?? { x: 0, y: 0 };
        return {
          id: n.id,
          type: 'lf',
          position: pos,
          data: {
            label: n.label,
            kind: n.kind,
            dim: !visibleSet.has(n.id) || Boolean(n.dim),
            selected: n.id === selected,
            // #143 — PageRank lives in `meta.pagerank` (number) from the
            // API transformer. Default 0 so mock data (no pagerank) keeps
            // the base kind size.
            pagerank: typeof n.meta?.pagerank === 'number' ? n.meta.pagerank : 0,
            onSelect,
          },
          // Disable the default drag — Obsidian-style canvases keep the
          // layout immutable so the user can rely on relative position
          // memory across sessions.
          draggable: false,
        };
      }),
    [data.nodes, layout, visibleSet, selected, onSelect],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      data.edges.map((e) => {
        const isSelected = e.source === selected || e.target === selected;
        const bothVisible = visibleSet.has(e.source) && visibleSet.has(e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          // Thin curved edges read calmer than the default straight lines
          // when nodes sit on the same ring. ``smoothstep`` is built in.
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: isSelected ? GRAPH_PRIMARY : 'hsl(var(--border-strong))',
            strokeWidth: isSelected ? 2 : 1,
            opacity: bothVisible ? (isSelected ? 1 : 0.45) : 0.08,
          },
        };
      }),
    [data.edges, visibleSet, selected],
  );

  // Keep the viewport centered on first mount + whenever the dataset
  // identity changes. Once mounted, the user owns the camera (pan/zoom).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const handlePaneClick = useCallback(() => {
    // Clicking empty space deselects, matching Obsidian's interaction.
    if (selected != null) onSelect('');
  }, [onSelect, selected]);
  useEffect(() => {
    // No-op for now — `fitView` on the ReactFlow component below does
    // the initial framing. Keeps the ref handy for the upcoming
    // local-graph "focus on node" follow-up.
  }, [data]);

  return (
    <div ref={wrapperRef} className={cn('size-full', className)}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        // #87 / #73 60-fps target. Each flag below shaves measurable
        // CPU off pan/zoom on a 1000+ node graph:
        //
        // * `onlyRenderVisibleElements` — culls off-screen nodes from
        //   the React tree during pan/zoom. The single biggest win on
        //   the full corpus.
        // * `nodesDraggable / nodesConnectable / nodesFocusable` —
        //   we never let the user drag or connect nodes (layout is
        //   computed deterministically). Disabling them skips the
        //   per-node listener wiring + hit-testing in xyflow's
        //   pointer handler.
        // * `edgesFocusable` — same idea for edges; the SPA doesn't
        //   surface edge-level interactions.
        // * `elevateNodesOnSelect: false` — avoids the relatively
        //   expensive z-index reshuffle on every selection.
        onlyRenderVisibleElements
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elevateNodesOnSelect={false}
        onPaneClick={handlePaneClick}
        // Plain pan/zoom — no Obsidian-style inertia for this first cut.
        panOnDrag
        panOnScroll
        zoomOnScroll
        minZoom={0.2}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="hsl(var(--bg) / 0.6)"
          nodeColor={(node) => GRAPH_KIND_FILL[(node.data as LfNodeData).kind] ?? 'hsl(var(--muted-fg))'}
        />
      </ReactFlow>
    </div>
  );
}

/**
 * Public component. Wraps the inner renderer in a ``ReactFlowProvider``
 * so the parent page doesn't need to worry about react-flow's context
 * requirements.
 */
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
