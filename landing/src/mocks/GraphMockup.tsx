import type { Lang } from '@/i18n';

interface MockNode { x: number; y: number; r: number; c: string; }

const LEGEND: Record<Lang, [string, string, string, string]> = {
  es: ['Ley', 'Artículo', 'Referencia', 'Modificación'],
  en: ['Law', 'Article', 'Reference', 'Amendment'],
};

const NODES: MockNode[] = [
  { x: 50,  y: 60,  r: 16, c: 'hsl(252, 95%, 76%)' },
  { x: 130, y: 30,  r: 10, c: 'hsl(217, 91%, 60%)' },
  { x: 200, y: 90,  r: 22, c: 'hsl(252, 95%, 76%)' },
  { x: 145, y: 140, r: 12, c: 'hsl(36, 95%, 60%)' },
  { x: 250, y: 165, r: 8,  c: 'hsl(195, 70%, 55%)' },
  { x: 75,  y: 150, r: 9,  c: 'hsl(36, 95%, 60%)' },
  { x: 295, y: 50,  r: 11, c: 'hsl(217, 91%, 60%)' },
  { x: 320, y: 130, r: 14, c: 'hsl(252, 95%, 76%)' },
];

const EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [2, 1], [2, 3], [2, 6], [2, 7], [3, 4], [3, 5], [6, 7], [4, 7],
];

export function GraphMockup({ lang }: { lang: Lang }) {
  const [law, article, reference, amendment] = LEGEND[lang];
  return (
    <div className="lf-mock lf-mock-graph">
      <div className="lf-mock-tools">
        <div className="lf-mock-tool">+</div>
        <div className="lf-mock-tool">−</div>
        <div className="lf-mock-tool" style={{ width: 'auto', padding: '0 8px', fontSize: 10 }}>fit</div>
      </div>
      <svg viewBox="0 0 360 220" width="100%" height="100%">
        <g stroke="hsl(var(--border-strong))" strokeWidth="1" opacity="0.5">
          {EDGES.map(([a, b], i) => (
            <line key={i} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
          ))}
        </g>
        {NODES.map((n, i) => (
          <g key={i} transform={`translate(${n.x},${n.y})`}>
            <circle r={n.r + 4} fill={n.c} opacity="0.18" />
            <circle r={n.r} fill={n.c} />
          </g>
        ))}
      </svg>
      <div className="lf-mock-legend">
        <span><i style={{ background: 'hsl(252, 95%, 76%)' }} />{law}</span>
        <span><i style={{ background: 'hsl(36, 95%, 60%)' }} />{article}</span>
        <span><i style={{ background: 'hsl(217, 91%, 60%)' }} />{reference}</span>
        <span><i style={{ background: 'hsl(195, 70%, 55%)' }} />{amendment}</span>
      </div>
    </div>
  );
}
