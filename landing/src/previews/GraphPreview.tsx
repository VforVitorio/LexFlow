/**
 * Obsidian-style graph preview card for the landing.
 *
 * Extends the HeroGraph idiom (small hand-tuned SVG with hover-driven
 * neighbour highlighting + a floating card) to 16 nodes, richer node
 * metadata, and a dimmed-background story for the rest of the corpus.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Pattern:           hover-driven neighbour highlight + floating card (the
 *                    smaller HeroGraph mock was retired in #716; see git log)
 * SPA target:        frontend/src/pages/GraphPage.tsx
 *                    frontend/src/components/domain/GraphCanvas.tsx
 * Styles:            landing/src/landing.css   .lf-prev-graph-*
 * Audit / future:    Issue #87 (Obsidian-style graph renderer)
 *
 * Hover semantics — same as Obsidian:
 *   focused node + 1-hop neighbours stay bright; everything else dims to
 *   opacity 0.22-0.28. Edges that touch the focused node bright, others
 *   dimmed. Floating card snaps to the focused node and shows its label,
 *   rango, and degree.
 */

import { useMemo, useState } from 'react';
import type { Lang } from '@/i18n';
import { PreviewChrome } from './PreviewChrome';

const TITLE: Record<Lang, string> = { es: 'Grafo · LexFlow', en: 'Graph · LexFlow' };

type Kind = 'law' | 'article' | 'reform';
interface Node {
  id: string;
  x: number;
  y: number;
  kind: Kind;
  /** Display label per language. */
  label: { es: string; en: string };
  rango: string;
}
interface Edge { a: string; b: string; }

const NODES: Node[] = [
  { id: 'CE',    x: 360, y:  90, kind: 'law',     label: { es: 'Constitución Española',           en: 'Spanish Constitution'           }, rango: 'Norma constitucional' },
  { id: 'LOPDGDD', x: 230, y: 175, kind: 'law',   label: { es: 'LOPDGDD',                         en: 'LOPDGDD'                         }, rango: 'Ley Orgánica' },
  { id: 'RGPD',  x: 130, y: 110, kind: 'reform',  label: { es: 'RGPD (UE) 2016/679',              en: 'GDPR (EU) 2016/679'              }, rango: 'Reglamento UE' },
  { id: 'LBSAH', x: 470, y: 185, kind: 'law',     label: { es: 'Ley básica de Administración',    en: 'Public Administration Basic Law' }, rango: 'Ley' },
  { id: 'ET',    x: 590, y: 100, kind: 'law',     label: { es: 'Estatuto de los Trabajadores',    en: "Workers' Statute"                }, rango: 'RD Legislativo' },
  { id: 'LRJS',  x: 660, y: 230, kind: 'law',     label: { es: 'Ley Reguladora Jurisdicción Social', en: 'Social Jurisdiction Law'      }, rango: 'Ley' },
  { id: 'LGT',   x: 510, y: 320, kind: 'law',     label: { es: 'Ley General Tributaria',          en: 'General Tax Law'                  }, rango: 'Ley' },
  { id: 'LRJSP', x: 360, y: 270, kind: 'law',     label: { es: 'LRJSP',                           en: 'LRJSP'                            }, rango: 'Ley' },
  { id: 'LPACAP', x: 250, y: 305, kind: 'law',    label: { es: 'LPACAP',                          en: 'LPACAP'                           }, rango: 'Ley' },
  { id: 'art22', x: 170, y: 250, kind: 'article', label: { es: 'Art. 22 LOPDGDD',                 en: 'Art. 22 LOPDGDD'                  }, rango: 'Artículo' },
  { id: 'art35', x:  80, y: 195, kind: 'article', label: { es: 'Art. 35 RGPD',                    en: 'Art. 35 GDPR'                     }, rango: 'Artículo' },
  { id: 'L2023', x: 320, y: 385, kind: 'reform',  label: { es: 'Ley 31/2023 — reforma',           en: 'Law 31/2023 — reform'             }, rango: 'Reforma' },
  { id: 'L2024', x: 460, y: 405, kind: 'reform',  label: { es: 'Ley 12/2024 — reforma',           en: 'Law 12/2024 — reform'             }, rango: 'Reforma' },
  { id: 'art28', x: 130, y: 360, kind: 'article', label: { es: 'Art. 28 LOPDGDD',                 en: 'Art. 28 LOPDGDD'                  }, rango: 'Artículo' },
  { id: 'art100', x: 600, y: 380, kind: 'article', label: { es: 'Art. 100 LGT',                   en: 'Art. 100 LGT'                     }, rango: 'Artículo' },
  { id: 'art4',  x: 680, y: 145, kind: 'article', label: { es: 'Art. 4 ET',                       en: 'Art. 4 ET'                        }, rango: 'Artículo' },
];

const EDGES: Edge[] = [
  { a: 'CE', b: 'LOPDGDD' },
  { a: 'CE', b: 'ET' },
  { a: 'CE', b: 'LRJSP' },
  { a: 'CE', b: 'LBSAH' },
  { a: 'LOPDGDD', b: 'RGPD' },
  { a: 'LOPDGDD', b: 'art22' },
  { a: 'LOPDGDD', b: 'art28' },
  { a: 'RGPD', b: 'art35' },
  { a: 'art22', b: 'art35' },
  { a: 'LBSAH', b: 'LRJSP' },
  { a: 'LBSAH', b: 'LPACAP' },
  { a: 'ET', b: 'LRJS' },
  { a: 'ET', b: 'art4' },
  { a: 'LRJSP', b: 'LPACAP' },
  { a: 'LPACAP', b: 'L2023' },
  { a: 'L2023', b: 'L2024' },
  { a: 'L2024', b: 'LGT' },
  { a: 'LGT', b: 'art100' },
  { a: 'LRJSP', b: 'LGT' },
  { a: 'LRJSP', b: 'art28' },
];

const NODE_FILL: Record<Kind, string> = {
  law:     'hsl(var(--violet-400))',
  article: 'hsl(var(--blue-500))',
  reform:  'hsl(var(--amber-500))',
};

const COPY = {
  es: { idleHint: 'Pasa el cursor sobre cualquier nodo', degree: 'enlaces' },
  en: { idleHint: 'Hover any node',                       degree: 'links' },
} as const;

interface Props { lang: Lang; }

export function GraphPreview({ lang }: Props) {
  const t = COPY[lang] ?? COPY.en;
  // Idle focus = the central Constitution. Gives the floating card
  // something to render before the user has touched the canvas.
  const [focusId, setFocusId] = useState<string>('CE');

  // Neighbours of the focused node, as a Set for O(1) lookups during
  // node/edge dim calculations.
  const neighbours = useMemo(() => {
    const out = new Set<string>([focusId]);
    for (const e of EDGES) {
      if (e.a === focusId) out.add(e.b);
      else if (e.b === focusId) out.add(e.a);
    }
    return out;
  }, [focusId]);

  const focusedNode = NODES.find((n) => n.id === focusId)!;
  const degree = EDGES.reduce((n, e) => n + (e.a === focusId || e.b === focusId ? 1 : 0), 0);

  return (
    <div className="lf-prev" aria-hidden="true">
      <PreviewChrome title={TITLE[lang] ?? TITLE.en} />
      <div className="lf-prev-body lf-prev-graph">
      <svg viewBox="0 0 760 480" className="lf-prev-graph-svg">
        {/* Edges first so nodes paint over them */}
        {EDGES.map((e, i) => {
          const A = NODES.find((n) => n.id === e.a)!;
          const B = NODES.find((n) => n.id === e.b)!;
          const focused = e.a === focusId || e.b === focusId;
          return (
            <line
              key={i}
              x1={A.x} y1={A.y}
              x2={B.x} y2={B.y}
              stroke={focused ? 'hsl(var(--violet-400))' : 'hsl(var(--fg))'}
              strokeOpacity={focused ? 0.85 : 0.18}
              strokeWidth={focused ? 1.6 : 1}
            />
          );
        })}
        {NODES.map((n) => {
          const isFocus = n.id === focusId;
          const dim = !neighbours.has(n.id);
          const r = n.kind === 'law' ? 13 : n.kind === 'article' ? 8 : 10;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setFocusId(n.id)}
              className="lf-prev-graph-node"
              style={{ opacity: dim ? 0.32 : 1 }}
            >
              {isFocus && (
                <circle
                  cx={n.x} cy={n.y} r={r + 10}
                  fill="hsl(var(--violet-400))"
                  opacity="0.18"
                />
              )}
              <circle
                cx={n.x} cy={n.y} r={r}
                fill={NODE_FILL[n.kind]}
                stroke={isFocus ? 'hsl(var(--fg))' : 'transparent'}
                strokeWidth={isFocus ? 1.5 : 0}
              />
            </g>
          );
        })}
      </svg>
      <div
        className="lf-prev-graph-tooltip"
        style={{
          transform: `translate(${clamp(focusedNode.x + 28, 12, 540)}px, ${clamp(focusedNode.y - 24, 12, 380)}px)`,
        }}
      >
        <div className="lf-prev-graph-tooltip-label">{focusedNode.label[lang] ?? focusedNode.label.en}</div>
        <div className="lf-prev-graph-tooltip-meta">{focusedNode.rango} · {degree} {t.degree}</div>
      </div>
      <div className="lf-prev-graph-hint">{t.idleHint}</div>
      </div>
    </div>
  );
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}
