import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSource } from '@/lib/types';

export interface CitationCardProps {
  source: ChatSource;
  onClick?: () => void;
  className?: string;
}

export function CitationCard({ source, onClick, className }: CitationCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-md border border-border bg-surface p-3 text-left text-[13px] transition-colors',
        'hover:bg-surface-2 hover:border-border-strong',
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] text-muted">
        <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">{source.article}</span>
        <span>·</span>
        <span>{source.date}</span>
        <ExternalLink className="ml-auto size-3" />
      </div>
      <div className="mb-1 font-semibold leading-tight">{source.law}</div>
      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted">
        “{source.snippet}”
      </p>
    </button>
  );
}
