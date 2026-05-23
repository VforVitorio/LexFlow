import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'primary' | 'amber' | 'success' | 'danger' | 'info' | 'outline';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg border-border',
  primary: 'bg-primary-soft text-indigo-700 border-indigo-200/60 dark:text-indigo-300 dark:border-indigo-800',
  amber:   'bg-amber-soft text-amber-700 border-amber-300/60 dark:text-amber-300',
  success: 'bg-success-soft text-success border-success/30',
  danger:  'bg-danger-soft text-danger border-danger/30',
  info:    'bg-info/10 text-info border-info/30',
  outline: 'bg-transparent text-muted border-border-strong',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: React.ReactNode;
}

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-semibold leading-[18px] tracking-[0.02em]',
        badgeTones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
