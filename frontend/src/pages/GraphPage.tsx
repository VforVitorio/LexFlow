import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Minus, Filter, Download, Pin, X } from 'lucide-react';
import { Badge, Button, Chip, Input } from '@/components/ui';
import { GraphCanvas, NODE_KIND_LABELS } from '@/components/domain/GraphCanvas';
import { ErrorState } from '@/components/domain/ErrorState';
import { RightRail } from '@/components/shell/RightRail';
import { useGraph } from '@/lib/queries';
import type { GraphNodeKind } from '@/lib/types';

const ALL_KINDS: GraphNodeKind[] = ['law', 'article', 'reference', 'amendment', 'repealed'];
const NODE_FILL: Record<GraphNodeKind, string> = {
  law: 'hsl(232 72% 52%)', article: 'hsl(36 95% 56%)', reference: 'hsl(266 65% 60%)',
  amendment: 'hsl(195 70% 50%)', repealed: 'hsl(220 8% 55%)',
};

export function GraphPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Set<GraphNodeKind>>(new Set(ALL_KINDS));
  const [selected, setSelected] = useState<string | null>('CE');
  const { data: graph, error, refetch, isLoading } = useGraph('CE-1978');

  if (error) return <div className="p-10"><ErrorState onRetry={() => refetch()} description={String(error)} /></div>;
  if (!graph || isLoading) return <div className="p-10 text-muted">Cargando grafo…</div>;

  const node = selected ? graph.nodes.find((n) => n.id === selected) : null;
  const neighbours = selected ? graph.edges.filter((e) => e.source === selected || e.target === selected).slice(0, 12) : [];

  const toggle = (t: GraphNodeKind) => {
    const next = new Set(filters);
    next.has(t) ? next.delete(t) : next.add(t);
    setFilters(next);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-bg p-4">
          <Input icon={<Search className="size-3.5" />} placeholder="Buscar en el grafo…" className="w-72" />
          <span className="h-6 w-px bg-border" />
          {ALL_KINDS.map((t) => (
            <Chip
              key={t}
              active={filters.has(t)}
              onClick={() => toggle(t)}
              icon={<span className="size-2 rounded-full" style={{ background: NODE_FILL[t] }} />}
            >
              {NODE_KIND_LABELS[t]}
            </Chip>
          ))}
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" icon={<Filter className="size-3.5" />}>Filtros avanzados</Button>
            <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>PNG</Button>
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden bg-bg">
          <GraphCanvas data={graph} visibleKinds={filters} selected={selected} onSelect={setSelected} />

          {/* Legend */}
          <div className="absolute bottom-4 left-4 rounded-lg border border-border bg-surface/90 px-3.5 py-2.5 shadow-1 backdrop-blur">
            <div className="label-caps mb-2">Leyenda</div>
            <div className="flex flex-col gap-1.5 text-[12px]">
              {ALL_KINDS.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: NODE_FILL[t] }} />
                  {NODE_KIND_LABELS[t]}
                </div>
              ))}
            </div>
          </div>

          {/* Zoom */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
            <Button size="icon" variant="secondary" aria-label="Acercar" icon={<Plus className="size-3.5" />} />
            <Button size="icon" variant="secondary" aria-label="Alejar" icon={<Minus className="size-3.5" />} />
          </div>
        </div>
      </div>

      <RightRail>
        {node ? (
          <>
            <div className="mb-3.5 flex items-center gap-2">
              <Badge style={{ background: NODE_FILL[node.kind], color: 'white', border: 'transparent' }}>
                {NODE_KIND_LABELS[node.kind]}
              </Badge>
              <span className="ml-auto flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Fijar" icon={<Pin className="size-3.5" />} />
                <Button size="icon-sm" variant="ghost" aria-label="Cerrar" onClick={() => setSelected(null)} icon={<X className="size-3.5" />} />
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold">{node.label}</h2>
            <p className="mt-1.5 text-[13px] text-muted">
              {node.kind === 'law' && 'Norma con 169 artículos y 1.248 referencias entrantes.'}
              {node.kind === 'article' && 'Artículo perteneciente al Título I, Capítulo II.'}
              {node.kind === 'reference' && 'Norma supranacional o doctrina citada por la norma activa.'}
              {node.kind === 'amendment' && 'Norma que modifica la activa.'}
              {node.kind === 'repealed' && 'Norma derogada — visible para contexto histórico.'}
            </p>

            <div className="label-caps mb-2 mt-4">Conexiones</div>
            <div className="flex flex-wrap gap-1.5">
              {neighbours.map((e) => {
                const other = e.source === node.id ? e.target : e.source;
                const o = graph.nodes.find((n) => n.id === other);
                if (!o) return null;
                return <Chip key={e.id} onClick={() => setSelected(other)}>{o.label}</Chip>;
              })}
            </div>

            <Button className="mt-5 w-full" onClick={() => navigate(`/laws/CE-1978`)}>Abrir norma</Button>
          </>
        ) : (
          <div className="text-[13px] text-muted">
            Selecciona un nodo del grafo para ver detalles.
          </div>
        )}
      </RightRail>
    </div>
  );
}
