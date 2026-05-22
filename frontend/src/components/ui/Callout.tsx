import { cn } from '@/lib/utils';
import { Info, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

type Tone = 'info' | 'warning' | 'success' | 'danger';

const calloutTones: Record<Tone, { bd: string; bg: string; fg: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info:    { bd: 'border-info/30',          bg: 'bg-info/8',          fg: 'text-info',    Icon: Info },
  warning: { bd: 'border-amber-500/40',     bg: 'bg-amber-soft',      fg: 'text-amber-700 dark:text-amber-300', Icon: AlertTriangle },
  success: { bd: 'border-success/30',       bg: 'bg-success-soft',    fg: 'text-success', Icon: CheckCircle2 },
  danger:  { bd: 'border-danger/30',        bg: 'bg-danger-soft',     fg: 'text-danger',  Icon: XCircle },
};

export interface CalloutProps {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Callout({ tone = 'info', title, children, className }: CalloutProps) {
  const t = calloutTones[tone];
  return (
    <div className={cn('flex gap-3 rounded-md border p-3', t.bd, t.bg, className)}>
      <t.Icon className={cn('size-4 mt-0.5 shrink-0', t.fg)} />
      <div className="min-w-0">
        {title && <div className={cn('mb-0.5 text-[13.5px] font-semibold', t.fg)}>{title}</div>}
        <div className="text-[13px] leading-relaxed text-fg">{children}</div>
      </div>
    </div>
  );
}
