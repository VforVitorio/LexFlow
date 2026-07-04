import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUi, RIGHT_RAIL_MIN, RIGHT_RAIL_MAX } from '@/lib/store';
import { cn } from '@/lib/utils';
import { RailResizer } from './RailResizer';
import { useEdgeResize } from './use-edge-resize';

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
  const mobileOpen = useUi((s) => s.mobileRightOpen);
  const setMobileRight = useUi((s) => s.setMobileRight);
  const rightWidth = useUi((s) => s.rightWidth);
  const setRightWidth = useUi((s) => s.setRightWidth);
  const { t } = useTranslation();
  const { dragging, startDrag } = useEdgeResize('right', setRightWidth);
  if (!open && !mobileOpen) return null;

  return (
    <>
      {/* Desktop: docked side panel, drag-resizable on its left edge (#594).
          The aside itself doesn't scroll — an inner div does — so the resize
          separator stays pinned to the edge instead of scrolling away. */}
      {open && (
      <aside
        role="complementary"
        aria-label="Panel contextual"
        style={{ width: rightWidth }}
        className={cn(
          'relative hidden shrink-0 border-l border-border bg-surface md:block',
          'animate-in slide-in-from-right duration-200',
          !dragging && 'transition-[width] duration-200',
        )}
      >
        <div className={cn('h-full overflow-auto p-5 scrollbar-thin', className)}>{children}</div>
        <RailResizer
          edge="right"
          width={rightWidth}
          setWidth={setRightWidth}
          min={RIGHT_RAIL_MIN}
          max={RIGHT_RAIL_MAX}
          label={t('nav.resizePanel')}
          dragging={dragging}
          startDrag={startDrag}
        />
      </aside>
      )}

      {/* Mobile: bottom sheet + dismissible backdrop. Driven by the separate,
          non-persisted `mobileRightOpen` so a fresh mobile visit never opens
          the sheet over the page behind a scrim (#826 M3). */}
      {mobileOpen && (
      <div className="md:hidden">
        <button
          type="button"
          aria-label="Cerrar panel"
          onClick={() => setMobileRight(false)}
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
            'animate-in slide-in-from-bottom duration-200',
            className,
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="mx-auto h-1 w-10 rounded-full bg-border-strong" aria-hidden />
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={() => setMobileRight(false)}
              className="absolute right-4 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
      )}
    </>
  );
}
