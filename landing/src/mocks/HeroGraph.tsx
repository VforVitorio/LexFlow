import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * HeroGraph — ambient knowledge-graph visual for the landing hero.
 *
 * Hand-tuned 9-node layout (no force simulation at this scale; curated
 * positions read cleaner than a settled random spread). Interaction model
 * borrowed from the F1 StratLab docs graph view and adapted to LexFlow:
 *
 *   - Hover any node → that node + its direct neighbours stay bright; the
 *     rest dims to ~25 % opacity, edges to the same.
 *   - The single floating tooltip card snaps to the hovered node and
 *     reflects its metadata (label, kind, neighbours count, fallback line).
 *   - On idle (no hover) the central law node is "focused" so the card
 *     never disappears entirely — gives the hero a stable visual weight.
 *
 * Pure SVG, no library beyond React. Respects `prefers-reduced-motion`
 * via the existing `lf-graph-*` CSS rules in landing.css.
 */

type NodeKind = 'law' | 'article' | 'ref' | 'amend';

interface HeroNode {
  id: string;
  x: number;
  y: number;
  r: number;
  kind: NodeKind;
  label: string;
  meta: string;
}

const NODES: HeroNode[] = [
  { id: 'a', x: 250, y: 110, r: 28, kind: 'law',     label: 'LOPDGDD',     meta: 'LO 3/2018' },
  { id: 'b', x: 100, y: 220, r: 22, kind: 'law',     label: 'RGPD',        meta: 'UE 2016/679' },
  { id: 'c', x: 410, y: 220, r: 22, kind: 'law',     label: 'CP',          meta: 'LO 10/1995' },
  { id: 'd', x: 180, y: 360, r: 18, kind: 'article', label: 'Art. 28',     meta: 'Responsable' },
  { id: 'e', x: 320, y: 380, r: 18, kind: 'article', label: 'Art. 197 ter', meta: 'CP · 2024' },
  { id: 'f', x: 70,  y: 110, r: 14, kind: 'ref',     label: 'DUDH',        meta: '1948 · ONU' },
  { id: 'g', x: 460, y: 110, r: 14, kind: 'amend',   label: 'Ley 11/2023', meta: 'Modifica art. 28' },
  { id: 'h', x: 250, y: 460, r: 14, kind: 'ref',     label: 'STC 84/2024', meta: 'Doctrina TC' },
  { id: 'i', x: 380, y: 60,  r: 10, kind: 'ref',     label: 'CE',          meta: '1978' },
];

const EDGES: Array<[string, string]> = [
  ['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e'],
  ['b', 'd'], ['c', 'e'], ['c', 'g'], ['b', 'f'],
  ['d', 'h'], ['e', 'h'], ['a', 'i'], ['a', 'g'],
];

const COLOR: Record<NodeKind, string> = {
  law:     'hsl(252, 95%, 76%)',
  article: 'hsl(36, 95%, 60%)',
  ref:     'hsl(217, 91%, 60%)',
  amend:   'hsl(195, 70%, 55%)',
};

const KIND_LABEL: Record<NodeKind, string> = {
  law: 'Ley',
  article: 'Artículo',
  ref: 'Referencia',
  amend: 'Modificación',
};

/** Default focused node when no hover — keeps the tooltip card visible. */
const IDLE_FOCUS = 'a';

export function HeroGraph() {
  const { t } = useTranslation('landing');
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? IDLE_FOCUS;

  const byId = useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), []);
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of NODES) map.set(n.id, new Set([n.id]));
    for (const [src, dst] of EDGES) {
      map.get(src)!.add(dst);
      map.get(dst)!.add(src);
    }
    return map;
  }, []);
  const focusedSet = neighbours.get(focus) ?? new Set([focus]);
  const focusedNode = byId[focus];
  const focusedDegree = (neighbours.get(focus)?.size ?? 1) - 1;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="0 0 520 520" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="lf-hero-bg" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="hsl(252, 95%, 76%)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="hsl(252, 95%, 76%)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lf-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor="hsl(252, 95%, 76%)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity="0.55" />
          </linearGradient>
          <filter id="lf-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="260" cy="220" r="260" fill="url(#lf-hero-bg)" />

        <circle cx="250" cy="220" r="180" fill="none" stroke="hsl(var(--border))" strokeDasharray="2 6" opacity="0.5" />
        <circle cx="250" cy="220" r="90"  fill="none" stroke="hsl(var(--border))" strokeDasharray="2 6" opacity="0.4" />

        {/* Edges: touching the focused node stay bright, others dim. */}
        <g strokeWidth="1.5" fill="none">
          {EDGES.map(([src, dst], i) => {
            const a = byId[src];
            const b = byId[dst];
            const onFocus = focusedSet.has(src) && focusedSet.has(dst);
            return (
              <line
                key={i}
                className={`lf-graph-edge d${i % 5}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="url(#lf-edge)"
                opacity={onFocus ? 0.95 : 0.18}
                style={{ transition: 'opacity 220ms cubic-bezier(0.2, 0, 0, 1)' }}
              />
            );
          })}
        </g>

        {/* Nodes: hover/focus driven highlight + a thin ring around the
            currently-focused node. Hit area is padded so 14px nodes are
            still reliably hoverable. */}
        {NODES.map((n, i) => {
          const c = COLOR[n.kind];
          const lit = focusedSet.has(n.id);
          const isFocus = focus === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              role="button"
              aria-label={`${KIND_LABEL[n.kind]} ${n.label}`}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <circle r={n.r + 12} fill="transparent" />
              <circle
                className={`lf-graph-node-halo d${i % 5}`}
                r={n.r + 6}
                fill={c}
                opacity={lit ? 1 : 0.25}
                style={{ transition: 'opacity 220ms cubic-bezier(0.2, 0, 0, 1)' }}
              />
              <circle
                r={n.r}
                fill={c}
                opacity={lit ? 0.98 : 0.32}
                filter={n.r > 20 ? 'url(#lf-glow)' : undefined}
                style={{ transition: 'opacity 220ms cubic-bezier(0.2, 0, 0, 1)' }}
              />
              <circle r={n.r - 6} fill="hsl(var(--bg))" opacity={lit ? 0.25 : 0.1} />
              {isFocus && (
                <circle r={n.r + 10} fill="none" stroke={c} strokeOpacity="0.6" strokeWidth="1.5" />
              )}
            </g>
          );
        })}
      </svg>

      <FloatingCard
        key={focus}
        node={focusedNode}
        degree={focusedDegree}
        kindLabel={KIND_LABEL[focusedNode.kind]}
        metaFallback={focus === IDLE_FOCUS ? t('hero.meta1') : focusedNode.meta}
      />
    </div>
  );
}

interface CardProps {
  node: HeroNode;
  degree: number;
  kindLabel: string;
  metaFallback: string;
}

function FloatingCard({ node, degree, kindLabel, metaFallback }: CardProps) {
  // Clamp the card centre so it stays inside the SVG drawing area; the
  // card is ~220x60 so the safe centre range is [120, 400] × [40, 460]
  // inside the 520x520 viewBox.
  const cx = Math.min(400, Math.max(120, node.x));
  const cy = Math.min(460, Math.max(40,  node.y - node.r - 30));
  const color = COLOR[node.kind];
  return (
    <div
      className="lf-float lf-graph-card"
      style={{
        position: 'absolute',
        left: `${(cx / 520) * 100}%`,
        top: `${(cy / 520) * 100}%`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div
        className="lf-float-dot"
        style={{ background: color, color, boxShadow: `0 0 10px ${color}` }}
      />
      <div>
        <div className="lf-float-k">{node.label}</div>
        <div className="lf-float-v">
          {kindLabel} · {metaFallback} · {degree} {degree === 1 ? 'enlace' : 'enlaces'}
        </div>
      </div>
    </div>
  );
}
