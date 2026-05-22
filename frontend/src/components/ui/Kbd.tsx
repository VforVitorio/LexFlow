import { cn } from '@/lib/utils';

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn(
      'inline-flex items-center rounded border border-border bg-surface-2 px-1.5 py-px font-mono text-[11px] leading-tight text-muted',
      className,
    )}>{children}</kbd>
  );
}
