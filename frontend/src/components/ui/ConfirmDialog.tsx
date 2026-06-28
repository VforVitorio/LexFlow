import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from '@/lib/confirm';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { cn } from '@/lib/utils';

/**
 * Promise-based confirmation modal — the accessible replacement for
 * `window.confirm` across the app (a11y #714). The context + `useConfirm`
 * hook live in `@/lib/confirm`; this file holds only the provider.
 *
 * Why a provider + hook instead of local state per call site: four
 * destructive actions (MCP server delete, two Settings deletes, chat
 * thread delete) each become a single `await confirm({...})` line and
 * share one focus-trapped `role="alertdialog"`, rather than repeating
 * dialog state + JSX four times.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  // Trap focus while open; on close the previously-focused trigger is
  // restored (e.g. the delete icon button), so keyboard users land back
  // where they were. The trap also auto-focuses Cancel first — the safe
  // default for a destructive prompt.
  useFocusTrap(panelRef, opts !== null);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px] animate-in"
          onClick={() => close(false)}
        >
          <div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close(false);
            }}
            className="air-glass-strong w-[400px] max-w-[92vw] p-5"
          >
            <div className={cn('flex items-center gap-2', opts.tone === 'danger' ? 'text-danger' : 'text-fg')}>
              {opts.tone === 'danger' && <AlertTriangle className="size-5 shrink-0" />}
              <h2 id="confirm-dialog-title" className="text-base font-semibold">
                {opts.title}
              </h2>
            </div>
            <p id="confirm-dialog-message" className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
              {opts.message}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)}>
                {opts.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button variant={opts.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
                {opts.confirmLabel ?? t('common.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
