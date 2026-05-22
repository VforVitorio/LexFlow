import { cn } from '@/lib/utils';
import type { ArticleDiff, DiffSide } from '@/lib/types';

export interface DiffViewerProps {
  diff: ArticleDiff;
  view: 'side' | 'inline';
}

export function DiffViewer({ diff, view }: DiffViewerProps) {
  if (view === 'inline') return <InlineDiff diff={diff} />;
  return (
    <div className="grid h-full grid-cols-2">
      <DiffPane side="left" data={diff.left} />
      <DiffPane side="right" data={diff.right} />
    </div>
  );
}

function DiffPane({ side, data }: { side: 'left' | 'right'; data: DiffSide }) {
  return (
    <div className={cn(side === 'left' && 'border-r border-border')}>
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-surface px-4 py-2.5">
        <span className="font-mono font-semibold">{data.tag}</span>
        <span className="text-[12px] text-muted">{data.date}</span>
      </div>
      <div className="py-3.5 text-[13.5px] leading-relaxed">
        {data.lines.map((l, i) => {
          if (side === 'left' && l.t === 'add') return <div key={i} className="min-h-6" />;
          if (side === 'right' && l.t === 'del') return <div key={i} className="min-h-6" />;
          const bg = l.t === 'add' ? 'diff-add' : l.t === 'del' ? 'diff-del' : '';
          const mark = l.t === 'add' ? <span className="text-success font-mono font-semibold">+</span>
                       : l.t === 'del' ? <span className="text-danger font-mono font-semibold">−</span>
                       : <span className="text-transparent">·</span>;
          return (
            <div key={i} className={cn('flex gap-3 px-4 py-0.5', bg)}>
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted">{i + 1}</span>
              <span className="w-3.5 shrink-0">{mark}</span>
              <span className="flex-1 text-pretty">{l.s || '\u00A0'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineDiff({ diff }: { diff: ArticleDiff }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-6 text-[14px] leading-relaxed">
      {diff.right.lines.map((l, i) => {
        if (l.t === 'add') {
          return (
            <div key={i} className="diff-add mb-0.5 border-l-[3px] border-success px-2.5 py-1">
              <span className="mr-2 font-mono font-semibold text-success">+</span>{l.s}
            </div>
          );
        }
        return <div key={i} className="px-2.5 py-1">{l.s || '\u00A0'}</div>;
      })}
      {diff.left.lines.filter((l) => l.t === 'del').map((l, i) => (
        <div key={`d-${i}`} className="diff-del mb-0.5 border-l-[3px] border-danger px-2.5 py-1 line-through opacity-70">
          <span className="mr-2 inline-block font-mono font-semibold text-danger no-underline">−</span>{l.s}
        </div>
      ))}
    </div>
  );
}
