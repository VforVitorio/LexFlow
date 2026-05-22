import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  illustration?: React.ReactNode;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

export function EmptyState({ title, description, illustration, primaryAction, secondaryAction, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'rounded-lg border border-dashed border-border-strong bg-surface/40 px-7 py-8 text-center',
      className,
    )}>
      {illustration || <DefaultEmptyIllustration />}
      <h3 className="mt-3.5 font-display text-base font-semibold">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="mt-3.5 inline-flex gap-2">
          {primaryAction && <Button size="sm" onClick={primaryAction.onClick}>{primaryAction.label}</Button>}
          {secondaryAction && (
            <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
          )}
        </div>
      )}
    </div>
  );
}

function DefaultEmptyIllustration() {
  return (
    <svg width="72" height="56" viewBox="0 0 72 56" fill="none" stroke="hsl(var(--indigo-400, 232 75% 62%))" strokeWidth="1.25" className="mx-auto block">
      <rect x="10" y="6" width="44" height="44" rx="3" />
      <path d="M16 18h28M16 26h22M16 34h18" />
      <circle cx="58" cy="44" r="9" stroke="hsl(232 72% 52%)" />
      <path d="m64 50 6 6" stroke="hsl(232 72% 52%)" />
    </svg>
  );
}
