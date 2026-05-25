import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Download, ChevronDown, ChevronRight, BookOpenText, Hash } from 'lucide-react';
import { Badge, Button, Checkbox, Chip, Input, Tabs } from '@/components/ui';
import { EmptyState } from '@/components/domain/EmptyState';
import { useLawsList, useTags } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { cn, formatDate, formatNumber, statusLabel } from '@/lib/utils';
import type { LawStatus, RangoNormativo, Ambito } from '@/lib/types';

const STATUSES: LawStatus[] = ['vigente', 'modificada', 'derogada'];
const RANGOS: RangoNormativo[] = ['Norma constitucional', 'Ley Orgánica', 'Ley', 'Real Decreto', 'RD Legislativo'];
const AMBITOS: Ambito[] = ['Estatal', 'UE', 'Autonómica', 'Local'];

export function ExplorerPage() {
  const navigate = useNavigate();
  const { density, setDensity } = useUi();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Set<LawStatus>>(new Set(['vigente']));
  const [rango, setRango] = useState<Set<RangoNormativo>>(new Set());
  const [ambito, setAmbito] = useState<Set<Ambito>>(new Set(['Estatal']));
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'relevance' | 'date' | 'refs' | 'title'>('relevance');

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const urlTags = searchParams.get('tags');
    if (urlTags) {
      setTags(new Set(urlTags.split(',').map((t) => t.trim()).filter(Boolean)));
    }
    // run once on mount; subsequent UI clicks own the state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Pull `#tag` tokens out of the free-text input so users can type
   * `#laboral despido` and have it Just Work — Obsidian-style.
   * Inline tags merge with the chip-driven set.
   */
  const { plainQ, allTags } = useMemo(() => {
    const tokens = q.split(/\s+/).filter(Boolean);
    const inline = tokens.filter((t) => t.startsWith('#')).map((t) => t.slice(1).toLowerCase());
    const plain = tokens.filter((t) => !t.startsWith('#')).join(' ');
    return { plainQ: plain, allTags: new Set<string>([...tags, ...inline]) };
  }, [q, tags]);

  const params = useMemo(() => ({
    q: plainQ || undefined,
    status: status.size ? [...status] : undefined,
    rango: rango.size ? [...rango] : undefined,
    ambito: ambito.size ? [...ambito] : undefined,
    tags: allTags.size ? [...allTags] : undefined,
    sort,
  }), [plainQ, status, rango, ambito, allTags, sort]);

  const { data, isLoading } = useLawsList(params);
  const { data: vocab = [] } = useTags();
  const items = data?.items ?? [];

  const rowH = density === 'compact' ? 40 : density === 'cozy' ? 64 : 52;
  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Filter rail */}
      <aside aria-label="Filtros" className="w-64 shrink-0 overflow-auto border-r border-border bg-bg p-5 scrollbar-thin">
        <div className="label-caps mb-2.5">Filtros</div>

        <FilterGroup title="Estado">
          {STATUSES.map((s) => (
            <Checkbox
              key={s}
              checked={status.has(s)}
              onChange={() => setStatus(toggle(status, s))}
              label={statusLabel(s)}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Rango normativo">
          {RANGOS.map((r) => (
            <Checkbox
              key={r}
              checked={rango.has(r)}
              onChange={() => setRango(toggle(rango, r))}
              label={r}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Ámbito territorial">
          {AMBITOS.map((a) => (
            <Checkbox
              key={a}
              checked={ambito.has(a)}
              onChange={() => setAmbito(toggle(ambito, a))}
              label={a}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Año">
          <div className="flex items-center gap-2.5">
            <Input placeholder="1978" defaultValue="1978" className="h-8 w-20" />
            <span className="text-[12px] text-muted">—</span>
            <Input placeholder="2024" defaultValue="2024" className="h-8 w-20" />
          </div>
        </FilterGroup>

        <FilterGroup title="Tags">
          <p className="-mt-1 mb-1.5 text-[11px] text-muted">
            Click para alternar · escribe <code className="font-mono">#tag</code> en el buscador
          </p>
          <div className="flex flex-wrap gap-1.5">
            {vocab.slice(0, 16).map(({ tag, count }) => {
              const active = allTags.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags((prev) => {
                    const n = new Set(prev);
                    n.has(tag) ? n.delete(tag) : n.add(tag);
                    return n;
                  })}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11.5px] font-medium transition-colors',
                    active
                      ? 'border-transparent bg-indigo-600 text-white'
                      : 'border-border-strong bg-surface text-fg hover:bg-surface-2',
                  )}
                >
                  <Hash className="size-3 opacity-70" />
                  {tag}
                  <span className={cn('font-mono text-[10px]', active ? 'text-white/70' : 'text-muted')}>{count}</span>
                </button>
              );
            })}
          </div>
        </FilterGroup>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-border px-8 pt-5 pb-3.5">
          <h1 className="mb-3.5 font-display text-2xl font-semibold">Explorador</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              icon={<Search className="size-3.5" />}
              placeholder="Buscar por título, BOE, #tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 min-w-[280px] max-w-[480px]"
            />
            <SortButton sort={sort} setSort={setSort} />
            <Tabs variant="segmented" value={density} onChange={(v) => setDensity(v as 'compact' | 'comfortable' | 'cozy')} tabs={[
              { id: 'compact', label: '≡' },
              { id: 'comfortable', label: '≣' },
              { id: 'cozy', label: '☰' },
            ]} />
            <Button variant="secondary" icon={<Download className="size-3.5" />}>Exportar</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
            <span className="font-mono text-fg">{items.length}</span> de <span className="font-mono">{data?.total ?? 0}</span> normas ·
            {[...status].map((s) => (
              <Chip key={s} dismissable onDismiss={() => setStatus(toggle(status, s))}>{statusLabel(s)}</Chip>
            ))}
            {[...ambito].map((a) => (
              <Chip key={a} dismissable onDismiss={() => setAmbito(toggle(ambito, a))}>{a}</Chip>
            ))}
            {[...allTags].map((t) => (
              <Chip
                key={t}
                icon={<Hash className="size-3" />}
                dismissable
                onDismiss={() => {
                  // remove from both inline (free-text) and chip-driven sets
                  setTags((prev) => { const n = new Set(prev); n.delete(t); return n; });
                  setQ((s) => s.split(/\s+/).filter((tok) => tok.toLowerCase() !== '#' + t).join(' '));
                }}
              >
                {t}
              </Chip>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          {!isLoading && items.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="Sin resultados para esa búsqueda"
                description="Prueba con menos filtros o explora el grafo de referencias para encontrar normas relacionadas."
                primaryAction={{ label: 'Limpiar filtros', onClick: () => { setQ(''); setStatus(new Set()); setRango(new Set()); setAmbito(new Set()); } }}
                secondaryAction={{ label: 'Cómo buscar', onClick: () => {} }}
              />
            </div>
          ) : (
            <table className="w-full border-collapse text-[13.5px]">
              <thead className="sticky top-0 z-[1] bg-bg">
                <tr className="border-b border-border">
                  <Th className="w-[40%] pl-8">Norma</Th>
                  <Th sortable>Estado</Th>
                  <Th sortable>Rango</Th>
                  <Th sortable>Publicada</Th>
                  <Th sortable className="text-right">Arts.</Th>
                  <Th sortable className="text-right">Refs.</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => navigate(`/laws/${l.id}`)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-surface-2/50"
                    style={{ height: rowH }}
                  >
                    <td className={cn('pl-8 pr-3', density === 'compact' ? 'py-2' : 'py-3')}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-indigo-700 dark:text-indigo-200">
                          <BookOpenText className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{l.short}</div>
                          {density !== 'compact' && (
                            <div className="truncate text-[11.5px] text-muted">{l.title}</div>
                          )}
                          {density === 'cozy' && l.tags && l.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {l.tags.slice(0, 5).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTags((prev) => {
                                      const n = new Set(prev);
                                      n.has(t) ? n.delete(t) : n.add(t);
                                      return n;
                                    });
                                  }}
                                  className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft/60 px-1.5 py-px font-mono text-[10.5px] text-indigo-700 hover:bg-primary-soft dark:text-indigo-200"
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><Badge tone={l.status === 'vigente' ? 'success' : l.status === 'derogada' ? 'danger' : 'amber'}>{statusLabel(l.status)}</Badge></td>
                    <td className="text-muted">{l.rango}</td>
                    <td className="font-mono text-[12px] text-muted">{formatDate(l.publicada)}</td>
                    <td className="pr-4 text-right font-mono">{l.articulos}</td>
                    <td className="pr-4 text-right font-mono text-muted">{formatNumber(l.referencias)}</td>
                    <td className="pr-5"><ChevronRight className="size-3.5 text-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children, sortable, className }: { children?: React.ReactNode; sortable?: boolean; className?: string }) {
  return (
    <th className={cn('label-caps whitespace-nowrap px-3 py-2.5 text-left', className)}>
      <span className={cn('inline-flex items-center gap-1', sortable && 'cursor-pointer')}>
        {children}
        {sortable && <ChevronDown className="size-3 opacity-50" />}
      </span>
    </th>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 text-[12px] font-semibold">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

// Literal union shared with ``ExplorerPage``'s ``sort`` useState so
// adding a new sort key surfaces as a TS error at the call sites, not as
// a runtime "unknown sort" bug. The pre-refactor signature was
// ``setSort: (v: any) => void`` — proper typing now.
type SortKey = 'relevance' | 'date' | 'refs' | 'title';
const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Relevancia',
  date: 'Fecha',
  refs: 'Refs',
  title: 'Título',
};

function SortButton({ sort, setSort }: { sort: SortKey; setSort: (v: SortKey) => void }) {
  return (
    <select
      value={sort}
      onChange={(e) => setSort(e.target.value as SortKey)}
      className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm hover:bg-surface-2"
    >
      {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  );
}
