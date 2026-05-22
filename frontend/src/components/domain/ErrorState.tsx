import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  reportHref?: string;
  className?: string;
}

export function ErrorState({ title = 'Algo ha ido mal', description, onRetry, reportHref, className }: ErrorStateProps) {
  return (
    <div className={cn(
      'rounded-lg border border-danger/30 bg-danger-soft/40 px-7 py-8 text-center',
      className,
    )}>
      <XCircle className="mx-auto size-9 text-danger" />
      <h3 className="mt-2.5 font-display text-base font-semibold">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm font-mono text-[12px] text-muted">{description}</p>}
      <div className="mt-3.5 inline-flex gap-2">
        {onRetry && <Button size="sm" onClick={onRetry}>Reintentar</Button>}
        {reportHref && (
          <a href={reportHref} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost">Reportar bug</Button>
          </a>
        )}
      </div>
    </div>
  );
}
