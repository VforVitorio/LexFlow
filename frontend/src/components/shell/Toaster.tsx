import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useToast, type ToastTone } from '@/lib/toast';

/**
 * Toast stack — mounts once at the app root.
 *
 * Renders the most recent `useToast.toasts` in the bottom-right corner.
 * Tone palette is shared with the :class:`Callout` primitive so the two
 * never drift. Each toast carries an optional title and a body line;
 * dismiss button + auto-TTL come from the store.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Toast TTL / cap        → ``lib/toast.ts``
 * * Position / animation   → this file
 * * Tone palette           → keep aligned with ``Callout`` in ui/
 */

const ICONS: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

const TONE_CLS: Record<ToastTone, { bd: string; bg: string; fg: string }> = {
  info:    { bd: 'border-info/40',          bg: 'bg-surface',         fg: 'text-info' },
  success: { bd: 'border-success/40',       bg: 'bg-surface',         fg: 'text-success' },
  warning: { bd: 'border-amber-500/50',     bg: 'bg-surface',         fg: 'text-amber-700 dark:text-amber-300' },
  danger:  { bd: 'border-danger/40',        bg: 'bg-surface',         fg: 'text-danger' },
};

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  // Escape clears the whole stack. Cheap quality-of-life touch.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') useToast.getState().clear();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        const tone = TONE_CLS[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              // pointer-events:auto so the dismiss button is clickable —
              // the wrapper above is ``none`` to keep the rest of the page
              // interactive through the gaps.
              'pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur',
              'animate-in slide-in-from-right-2 fade-in duration-200',
              tone.bd,
              tone.bg,
            )}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', tone.fg)} />
            <div className="min-w-0 flex-1">
              {t.title && (
                <div className={cn('text-[13.5px] font-semibold', tone.fg)}>{t.title}</div>
              )}
              <div className="text-[13px] leading-relaxed text-fg break-words">{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar notificación"
              className="text-muted transition hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
