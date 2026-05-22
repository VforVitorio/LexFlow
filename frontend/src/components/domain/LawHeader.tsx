import { Bookmark, Share2, Download, ChevronDown, Hash } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { formatDate, statusLabel } from '@/lib/utils';
import type { Law } from '@/lib/types';

export interface LawHeaderProps {
  law: Law;
  onExport?: () => void;
  onShare?: () => void;
  onBookmark?: () => void;
  /** Called when the user clicks a tag chip — typically navigates to /explorer?tags=… */
  onTagClick?: (tag: string) => void;
}

export function LawHeader({ law, onExport, onShare, onBookmark, onTagClick }: LawHeaderProps) {
  const tone =
    law.status === 'vigente' ? 'success' :
    law.status === 'derogada' ? 'danger' : 'amber';
  return (
    <header className="bg-bg pt-5 pb-0 px-8">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone={tone}>{statusLabel(law.status)}</Badge>
        <span className="font-mono text-[12px] text-muted">{law.boe}</span>
        <span className="text-[12px] text-muted">·</span>
        <span className="text-[12px] text-muted">{law.rango}</span>
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" icon={<Bookmark className="size-3.5" />} onClick={onBookmark}>Guardar</Button>
          <Button size="sm" variant="ghost" icon={<Share2 className="size-3.5" />} onClick={onShare}>Compartir</Button>
          <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={onExport}>Exportar</Button>
        </span>
      </div>
      <h1 className="text-3xl font-display font-semibold tracking-tight">{law.short}</h1>
      <p className="mt-1.5 max-w-3xl text-[13.5px] text-muted">{law.title}</p>

      <div className="mt-3.5 flex flex-wrap items-center gap-6 text-[13px]">
        <Stat label="Artículos" value={String(law.articulos)} />
        <Stat label="Versiones" value={String(law.versiones)} />
        <Stat label="Referencias" value={String(law.referencias)} />
        <Stat label="Última modificación" value={law.ultimaModificacion ? formatDate(law.ultimaModificacion) : '—'} />
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="label-caps">Versión</span>
          <Button size="sm" variant="secondary" iconRight={<ChevronDown className="size-3.5" />}>v1.3 (vigente)</Button>
        </span>
      </div>

      {law.tags && law.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {law.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTagClick?.(t)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-px font-mono text-[11px] text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-primary-soft dark:text-indigo-200 dark:hover:border-indigo-700"
            >
              <Hash className="size-3 opacity-70" />{t}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-[10.5px] uppercase tracking-[0.04em] text-muted">{label}</span>
      <span className="font-mono text-[14px] font-semibold">{value}</span>
    </span>
  );
}
