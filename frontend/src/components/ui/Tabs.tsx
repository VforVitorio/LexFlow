import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  count?: number | string;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange?: (id: string) => void;
  variant?: 'underline' | 'segmented';
  className?: string;
}

export function Tabs({ tabs, value, onChange, variant = 'underline', className }: TabsProps) {
  if (variant === 'segmented') {
    return (
      <div className={cn('inline-flex gap-0.5 rounded-md bg-surface-2 p-[3px]', className)}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange?.(t.id)}
            className={cn(
              'rounded px-3 py-1 text-[13px] font-medium transition-colors',
              value === t.id ? 'bg-bg text-fg shadow-1' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-border', className)}>
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(t.id)}
            className={cn(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors',
              active ? 'border-indigo-600 text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[11px] text-muted">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
