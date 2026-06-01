/**
 * ExplorerPage filter rail — `<aside>` with checkbox groups for
 * status / rango / ámbito / año + the tag cloud (#202).
 *
 * Split out of `ExplorerPage.tsx` so the page file can stay focused
 * on the table + main column. State stays in the parent — the rail
 * is pure UI and emits all changes via the setters it receives.
 */

import { Hash } from 'lucide-react';
import { Checkbox, Input } from '@/components/ui';
import { cn, statusLabel } from '@/lib/utils';
import type { Ambito, LawStatus, RangoNormativo } from '@/lib/types';

const STATUSES: LawStatus[] = ['vigente', 'modificada', 'derogada'];
const RANGOS: RangoNormativo[] = ['Norma constitucional', 'Ley Orgánica', 'Ley', 'Real Decreto', 'RD Legislativo'];
const AMBITOS: Ambito[] = ['Estatal', 'UE', 'Autonómica', 'Local'];

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
}: FilterRailProps) {
  return (
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
    </aside>
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
