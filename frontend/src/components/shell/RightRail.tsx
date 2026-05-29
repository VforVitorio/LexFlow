import { X } from 'lucide-react';
import { useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

/**
 * Generic contextual panel container. Pages render their own content inside —
 * we just provide the chrome, scroll behaviour, and theming.
 *
 * Responsive behaviour (issue #89):
 * - Desktop (`>= md`): a docked right-hand `aside`, 340px wide.
 * - Mobile (`< md`): a bottom sheet sliding up over the content, with a
 *   backdrop that dismisses it. Driven by the same `rightOpen` flag, so the
 *   TopBar toggle works on both form factors.
 */
export function RightRail({ children, className }: { children: React.ReactNode; className?: string }) {
  const open = useUi((s) => s.rightOpen);
  const setRight = useUi((s) => s.setRight);
  if (!open) return null;

  return (
    <>
      {/* Desktop: docked side panel. */}
      <aside
        role="complementary"
        aria-label="Panel contextual"
        className={cn(
          'hidden w-[340px] shrink-0 overflow-auto border-l border-border bg-surface p-5 scrollbar-thin md:block',
          className,
        )}
      >
        {children}
      </aside>

      {/* Mobile: bottom sheet + dismissible backdrop. */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="Cerrar panel"
          onClick={() => setRight(false)}
          className="fixed inset-0 z-40 bg-black/40 animate-in fade-in"
        />
        <div
          role="dialog"
          aria-label="Panel contextual"
          className={cn(
            // Glass bottom sheet so the page underneath stays partially
            // visible — the panel feels like an overlay, not a takeover.
            // Top corners only (sits on the screen edge); pb adds safe-area.
            'air-glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-auto rounded-b-none rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] scrollbar-thin',
            className,
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="mx-auto h-1 w-10 rounded-full bg-border-strong" aria-hidden />
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={() => setRight(false)}
              className="absolute right-4 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
