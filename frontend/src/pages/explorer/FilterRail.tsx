/**
 * ExplorerPage filter rail — `<aside>` with checkbox groups for
 * status / rango / ámbito / año + the tag cloud (#202).
 *
 * Split out of `ExplorerPage.tsx` so the page file can stay focused
 * on the table + main column. State stays in the parent — the rail
 * is pure UI and emits all changes via the setters it receives.
 */

import { useTranslation } from 'react-i18next';
import { Hash } from 'lucide-react';
import { Checkbox, Input } from '@/components/ui';
import { cn, statusLabel } from '@/lib/utils';
import type { Ambito, LawStatus, RangoNormativo } from '@/lib/types';

const STATUSES: LawStatus[] = ['vigente', 'modificada', 'derogada'];
const RANGOS: RangoNormativo[] = ['Norma constitucional', 'Ley Orgánica', 'Ley', 'Real Decreto', 'RD Legislativo'];
// Only scopes that exist in the corpus + map to a backend Scope.
// 'UE' has no SCOPE_MAP entry, so its reverse-lookup returned undefined
// and NO scope param was sent → the filter silently did nothing (#567).
// 'Local' maps cleanly but the corpus has 0 local norms, so it was an
// always-empty bucket (#568). Both removed until the data/feature exists
// (local norms would need a municipality picker, not a flat list).
const AMBITOS: Ambito[] = ['Estatal', 'Autonómica'];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

interface FilterRailProps {
  status: Set<LawStatus>;
  setStatus: (s: Set<LawStatus>) => void;
  rango: Set<RangoNormativo>;
  setRango: (r: Set<RangoNormativo>) => void;
  ambito: Set<Ambito>;
  setAmbito: (a: Set<Ambito>) => void;
  /** Tags currently active. Owned by the parent; the rail just paints + toggles. */
  allTags: Set<string>;
  setTags: (next: Set<string>) => void;
  /** Live tag vocabulary from `/api/v1/tags` (top-N shown). */
  vocab: Array<{ tag: string; count: number }>;
  /** Publication-year range (inclusive), as raw input strings (#563). */
  yearFrom: string;
  setYearFrom: (v: string) => void;
  yearTo: string;
  setYearTo: (v: string) => void;
  /**
   * When `true`, the rail renders as a plain `<section>` without the
   * fixed-width / hidden-on-mobile chrome — used inside the mobile
   * filter sheet where the parent owns the dialog wrapper.
   */
  inline?: boolean;
}

export function FilterRail({
  status,
  setStatus,
  rango,
  setRango,
  ambito,
  setAmbito,
  allTags,
  setTags,
  vocab,
  yearFrom,
  setYearFrom,
  yearTo,
  setYearTo,
  inline = false,
}: FilterRailProps) {
  const { t } = useTranslation();
  const body = (
    <FilterRailBody
      status={status}
      setStatus={setStatus}
      rango={rango}
      setRango={setRango}
      ambito={ambito}
      setAmbito={setAmbito}
      allTags={allTags}
      setTags={setTags}
      vocab={vocab}
      yearFrom={yearFrom}
      setYearFrom={setYearFrom}
      yearTo={yearTo}
      setYearTo={setYearTo}
    />
  );
  if (inline) {
    return <section aria-label={t('explorer.filters')}>{body}</section>;
  }
  return (
    // #36 — hidden on mobile; the Explorer header's `Filtrar` button (in
    // ExplorerPage) opens it as a slide-in sheet on <md via `inline`.
    // From md+ upwards it stays as the persistent left rail.
    <aside aria-label={t('explorer.filters')} className="hidden w-64 shrink-0 overflow-auto border-r border-border bg-bg p-5 scrollbar-thin md:block">
      {body}
    </aside>
  );
}

function FilterRailBody({
  status,
  setStatus,
  rango,
  setRango,
  ambito,
  setAmbito,
  allTags,
  setTags,
  vocab,
  yearFrom,
  setYearFrom,
  yearTo,
  setYearTo,
}: Omit<FilterRailProps, 'inline'>) {
  const { t } = useTranslation();
  return (
    <>
      <div className="label-caps mb-2.5">{t('explorer.filters')}</div>

      <FilterGroup title={t('explorer.groups.status')}>
        {STATUSES.map((s) => (
          <Checkbox
            key={s}
            checked={status.has(s)}
            onChange={() => setStatus(toggle(status, s))}
            label={statusLabel(s)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t('explorer.groups.rango')}>
        {RANGOS.map((r) => (
          <Checkbox
            key={r}
            checked={rango.has(r)}
            onChange={() => setRango(toggle(rango, r))}
            label={r}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t('explorer.groups.ambito')}>
        {AMBITOS.map((a) => (
          <Checkbox
            key={a}
            checked={ambito.has(a)}
            onChange={() => setAmbito(toggle(ambito, a))}
            label={a}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={t('explorer.groups.year')}>
        <div className="flex items-center gap-2.5">
          <Input
            inputMode="numeric"
            placeholder="1978"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="h-8 w-20"
            aria-label={t('explorer.groups.year') + ' — desde'}
          />
          <span className="text-[12px] text-muted">—</span>
          <Input
            inputMode="numeric"
            placeholder="2024"
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="h-8 w-20"
            aria-label={t('explorer.groups.year') + ' — hasta'}
          />
        </div>
      </FilterGroup>

      <FilterGroup title={t('explorer.groups.tags')}>
        <p className="-mt-1 mb-1.5 text-[11px] text-muted">
          {t('explorer.tagsHintPre')} <code className="font-mono">#tag</code> {t('explorer.tagsHintPost')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {vocab.slice(0, 16).map(({ tag, count }) => {
            const active = allTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setTags(toggle(allTags, tag))}
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
    </>
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
