import { cn } from '@/lib/utils';
import type { LawVersion } from '@/lib/types';

export interface VersionTimelineProps {
  versions: LawVersion[];
  current?: string;
  onSelect?: (tag: string) => void;
  className?: string;
}

export function VersionTimeline({ versions, current, onSelect, className }: VersionTimelineProps) {
  if (!versions.length) return null;
  return (
    <div className={cn('rounded-lg border border-border bg-surface px-6 py-5', className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="label-caps">Historial</span>
        <span className="font-mono text-[11px] text-muted">{versions.length} versiones</span>
      </div>
      <div className="relative pb-7 pt-5">
        <div className="absolute inset-x-0 top-[36px] h-px bg-border-strong" />
        {versions.map((v, i) => {
          const pct = versions.length === 1 ? 50 : (i / (versions.length - 1)) * 96 + 2;
          const isCurrent = v.tag === current;
          return (
            <button
              key={v.tag}
              onClick={() => onSelect?.(v.tag)}
              className="absolute top-5 -translate-x-1/2 text-center hover:cursor-pointer"
              style={{ left: `${pct}%` }}
            >
              <div className={cn(
                'mx-auto size-3.5 rounded-full border-[3px] border-bg',
                v.kind === 'publish' ? 'bg-indigo-500' : 'bg-amber-500',
                isCurrent && 'ring-2 ring-indigo-500',
              )} />
              <div className="mt-2 font-mono text-[10.5px] font-semibold">{v.tag}</div>
              <div className="text-[10.5px] text-muted">{v.date.slice(0, 7)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
