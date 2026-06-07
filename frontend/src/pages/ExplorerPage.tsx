import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Download, ChevronDown, ChevronRight, BookOpenText, Hash, SlidersHorizontal, X } from 'lucide-react';
import { Badge, Button, Callout, Chip, Input, Tabs } from '@/components/ui';
import { EmptyState } from '@/components/domain/EmptyState';
import { Skeleton } from '@/components/domain/Skeleton';
import { FilterRail } from '@/pages/explorer/FilterRail';
import { useLawsList, useTags } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { cn, formatDate, formatNumber, statusLabel } from '@/lib/utils';
import type { LawStatus, RangoNormativo, Ambito } from '@/lib/types';

export function ExplorerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const density = useUi((s) => s.density);
  const setDensity = useUi((s) => s.setDensity);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Set<LawStatus>>(new Set(['vigente']));
  const [rango, setRango] = useState<Set<RangoNormativo>>(new Set());
  const [ambito, setAmbito] = useState<Set<Ambito>>(new Set(['Estatal']));
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'relevance' | 'date' | 'refs' | 'title'>('relevance');
  // Toggled by the empty-state "How to search" button (#476). Surfaces an
  // inline help panel explaining the search syntax instead of a no-op.
  const [showSearchHelp, setShowSearchHelp] = useState(false);

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
  // Memoise so the `displayed` derivation below has a stable input reference
  // (a fresh `?? []` array every render would defeat its memoisation).
  const items = useMemo(() => data?.items ?? [], [data]);

  /**
   * Client-side sort + narrow over the LOADED PAGE only.
   *
   * `listLawsQuery` (lib/api/transformers.ts) drops `q`, `sort` and
   * `tags` because the backend list endpoint does not accept them yet,
   * which left the search box, the sort selector and the tag chips
   * decorative (#475). Until corpus-wide search lands on the backend we
   * apply them here as a PAGE-SCOPED fallback: this operates on `items`
   * (the current page returned by the server), NOT on the whole corpus —
   * so it sorts/narrows what is already on screen, it does not fetch or
   * search across pages.
   *
   * WHERE TO CHANGE IF X CHANGES: when the backend accepts q/sort/tags,
   * move these back into `listLawsQuery` and delete this block.
   */
  const displayed = useMemo(() => {
    let rows = items;

    // FILTER — narrow the current page honestly (page-scoped, not corpus-wide).
    if (plainQ) {
      const needle = plainQ.toLowerCase();
      rows = rows.filter((l) =>
        l.title.toLowerCase().includes(needle) ||
        l.short.toLowerCase().includes(needle) ||
        l.boe.toLowerCase().includes(needle),
      );
    }
    if (allTags.size) {
      // AND over the law's tags: every active tag must be present.
      rows = rows.filter((l) => {
        const lawTags = new Set((l.tags ?? []).map((tag) => tag.toLowerCase()));
        return [...allTags].every((tag) => lawTags.has(tag.toLowerCase()));
      });
    }

    // SORT — `relevance` keeps the server order; the rest sort a copy.
    if (sort === 'relevance') return rows;
    const sorted = [...rows];
    switch (sort) {
      case 'date':
        sorted.sort((a, b) => b.publicada.localeCompare(a.publicada));
        break;
      case 'title':
        sorted.sort((a, b) => (a.short || a.title).localeCompare(b.short || b.title));
        break;
      case 'refs':
        sorted.sort((a, b) => b.referencias - a.referencias);
        break;
    }
    return sorted;
  }, [items, plainQ, allTags, sort]);

  const rowH = density === 'compact' ? 40 : density === 'cozy' ? 64 : 52;
  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  };

  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0">
      <FilterRail
        status={status}
        setStatus={setStatus}
        rango={rango}
        setRango={setRango}
        ambito={ambito}
        setAmbito={setAmbito}
        allTags={allTags}
        setTags={setTags}
        vocab={vocab}
      />

      {/* Mobile filter sheet — same FilterRail wrapped in a slide-in panel
          when `filtersOpen` is true. The desktop rail above is hidden on
          mobile via its own `hidden md:block`. (#36) */}
      {filtersOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('explorer.filters')}
          className="fixed inset-0 z-[40] bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={(e) => e.target === e.currentTarget && setFiltersOpen(false)}
        >
          <div className="absolute left-0 top-0 flex h-full w-[80vw] max-w-[320px] flex-col bg-bg shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-display text-base font-semibold">{t('explorer.filters')}</span>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label={t('explorer.closeFilters')}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 scrollbar-thin">
              <FilterRail
                status={status}
                setStatus={setStatus}
                rango={rango}
                setRango={setRango}
                ambito={ambito}
                setAmbito={setAmbito}
                allTags={allTags}
                setTags={setTags}
                vocab={vocab}
                inline
              />
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-border px-5 pt-4 pb-3.5 md:px-8 md:pt-5">
          <h1 className="mb-3.5 font-display text-2xl font-semibold">{t('explorer.title')}</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              icon={<Search className="size-3.5" />}
              placeholder={t('explorer.searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 min-w-[200px] max-w-[480px]"
            />
            <Button
              variant="secondary"
              icon={<SlidersHorizontal className="size-3.5" />}
              onClick={() => setFiltersOpen(true)}
              className="md:hidden"
            >
              {t('explorer.filters')}
            </Button>
            <SortButton sort={sort} setSort={setSort} />
            <Tabs variant="segmented" value={density} onChange={(v) => setDensity(v as 'compact' | 'comfortable' | 'cozy')} tabs={[
              { id: 'compact', label: '≡' },
              { id: 'comfortable', label: '≣' },
              { id: 'cozy', label: '☰' },
            ]} />
            <Button variant="secondary" icon={<Download className="size-3.5" />} className="hidden sm:inline-flex">{t('explorer.export')}</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
            <span className="font-mono text-fg">{displayed.length}</span> {t('explorer.countOf')} <span className="font-mono">{data?.total ?? 0}</span> {t('explorer.countUnit')} ·
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
          {!isLoading && displayed.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title={t('explorer.empty.title')}
                description={t('explorer.empty.description')}
                primaryAction={{ label: t('explorer.clearFilters'), onClick: () => { setQ(''); setStatus(new Set()); setRango(new Set()); setAmbito(new Set()); } }}
                secondaryAction={{ label: t('explorer.howToSearch'), onClick: () => setShowSearchHelp((v) => !v) }}
              />
              {showSearchHelp && (
                <Callout tone="info" title={t('explorer.searchHelp.title')} className="mx-auto mt-4 max-w-md text-left">
                  <ul className="ml-4 list-disc space-y-1">
                    <li>{t('explorer.searchHelp.freetext')}</li>
                    <li>{t('explorer.searchHelp.tags')}</li>
                    <li>{t('explorer.searchHelp.filters')}</li>
                  </ul>
                </Callout>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-[13.5px]">
              <thead className="sticky top-0 z-[1] bg-bg">
                <tr className="border-b border-border">
                  <Th className="w-[40%] pl-8">{t('explorer.cols.law')}</Th>
                  <Th>{t('explorer.cols.status')}</Th>
                  <Th>{t('explorer.cols.rango')}</Th>
                  <Th>{t('explorer.cols.published')}</Th>
                  <Th className="text-right">{t('explorer.cols.articles')}</Th>
                  <Th className="text-right">{t('explorer.cols.refs')}</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              {/* During first-load show skeleton rows shaped like the real
                  data so the table doesn't reflow on hydration. Only fires
                  when we have no items yet — once a page is in cache the
                  refetch happens silently against the stale rows. */}
              {isLoading && items.length === 0 && (
                <tbody aria-busy>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border" style={{ height: rowH }}>
                      <td className="pl-8 pr-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="size-7 shrink-0 rounded-md" />
                          <div className="flex w-full flex-col gap-1.5">
                            <Skeleton className="h-3 w-2/5" />
                            {density !== 'compact' && <Skeleton className="h-2.5 w-3/4" />}
                          </div>
                        </div>
                      </td>
                      <td><Skeleton className="h-4 w-16 rounded-full" /></td>
                      <td><Skeleton className="h-3 w-20" /></td>
                      <td><Skeleton className="h-3 w-16" /></td>
                      <td className="text-right"><Skeleton className="ml-auto h-3 w-8" /></td>
                      <td className="text-right"><Skeleton className="ml-auto h-3 w-10" /></td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              )}
              <tbody>
                {displayed.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => navigate(`/laws/${encodeURIComponent(l.id)}`)}
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

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('label-caps whitespace-nowrap px-3 py-2.5 text-left', className)}>
      <span className="inline-flex items-center gap-1">{children}</span>
    </th>
  );
}


// Literal union shared with ``ExplorerPage``'s ``sort`` useState so
// adding a new sort key surfaces as a TS error at the call sites, not as
// a runtime "unknown sort" bug. The pre-refactor signature was
// ``setSort: (v: any) => void`` — proper typing now. Labels resolve via
// `explorer.sort.<key>` in the locale files.
type SortKey = 'relevance' | 'date' | 'refs' | 'title';
const SORT_KEYS: SortKey[] = ['relevance', 'date', 'refs', 'title'];

function SortButton({ sort, setSort }: { sort: SortKey; setSort: (v: SortKey) => void }) {
  const { t } = useTranslation();
  return (
    <select
      value={sort}
      onChange={(e) => setSort(e.target.value as SortKey)}
      className="h-9 rounded-md border border-border-strong bg-surface px-3 text-sm hover:bg-surface-2"
    >
      {SORT_KEYS.map((k) => (
        <option key={k} value={k}>{t(`explorer.sort.${k}`)}</option>
      ))}
    </select>
  );
}
