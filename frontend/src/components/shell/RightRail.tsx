import { useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

/**
 * Generic right-rail container. Pages render their own content inside —
 * we just provide the width, scroll behaviour, and theming border.
 */
export function RightRail({ children, className }: { children: React.ReactNode; className?: string }) {
  const open = useUi((s) => s.rightOpen);
  if (!open) return null;
  return (
    <aside
      role="complementary"
      aria-label="Panel contextual"
      className={cn(
        'w-[340px] shrink-0 overflow-auto border-l border-border bg-surface p-5 scrollbar-thin',
        className,
      )}
    >
      {children}
    </aside>
  );
}
