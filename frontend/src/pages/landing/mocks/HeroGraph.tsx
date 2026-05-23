import { useTranslation } from 'react-i18next';

type NodeKind = 'law' | 'article' | 'ref' | 'amend';

interface HeroNode {
  id: string;
  x: number;
  y: number;
  r: number;
  kind: NodeKind;
}

const NODES: HeroNode[] = [
  { id: 'a', x: 250, y: 110, r: 28, kind: 'law' },
  { id: 'b', x: 100, y: 220, r: 22, kind: 'law' },
  { id: 'c', x: 410, y: 220, r: 22, kind: 'law' },
  { id: 'd', x: 180, y: 360, r: 18, kind: 'article' },
  { id: 'e', x: 320, y: 380, r: 18, kind: 'article' },
  { id: 'f', x: 70,  y: 110, r: 14, kind: 'ref' },
  { id: 'g', x: 460, y: 110, r: 14, kind: 'amend' },
  { id: 'h', x: 250, y: 460, r: 14, kind: 'ref' },
  { id: 'i', x: 380, y: 60,  r: 10, kind: 'ref' },
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

export function HeroGraph() {
  const { t } = useTranslation('landing');
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="0 0 520 520" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="lf-hero-bg" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="hsl(252, 95%, 76%)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="hsl(252, 95%, 76%)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lf-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(252, 95%, 76%)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity="0.45" />
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

        <g stroke="url(#lf-edge)" strokeWidth="1.5" fill="none">
          {EDGES.map(([s, target], i) => {
            const a = byId[s];
            const b = byId[target];
            return <line key={i} className={`lf-graph-edge d${i % 5}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        {NODES.map((n, i) => {
          const c = COLOR[n.kind];
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
              <circle className={`lf-graph-node-halo d${i % 5}`} r={n.r + 6} fill={c} />
              <circle r={n.r} fill={c} opacity="0.95" filter={n.r > 20 ? 'url(#lf-glow)' : undefined} />
              <circle r={n.r - 6} fill="hsl(var(--bg))" opacity="0.25" />
            </g>
          );
        })}
      </svg>

      <div className="lf-float lf-float-tl">
        <div className="lf-float-dot" style={{ background: 'hsl(252, 95%, 76%)', color: 'hsl(252, 95%, 76%)' }} />
        <div>
          <div className="lf-float-k">LOPDGDD</div>
          <div className="lf-float-v">LO 3/2018 · {t('hero.meta1')}</div>
        </div>
      </div>

      <div className="lf-float lf-float-br">
        <div className="lf-float-dot" style={{ background: 'hsl(36, 95%, 60%)', color: 'hsl(36, 95%, 60%)' }} />
        <div>
          <div className="lf-float-k">{t('hero.meta3')}</div>
          <div className="lf-float-v">PageRank · 0.084</div>
        </div>
      </div>
    </div>
  );
}
