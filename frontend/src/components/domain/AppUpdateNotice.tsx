/**
 * Non-blocking desktop app-update banner (#698).
 *
 * Fixed bottom placement mirrors floating search / HelpDrawer offsets in
 * AppShell. Consumes `AppUpdateProvider` context — no Tauri compile-time deps.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { cn } from '@/lib/utils';
import { useAppUpdateContext } from '@/lib/updater/use-app-update';

function progressPercent(progress: { downloaded: number; total: number | null }): number | null {
  if (!progress.total) return null;
  return Math.round((progress.downloaded / progress.total) * 100);
}

export function AppUpdateNotice() {
  const { t } = useTranslation();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    status,
    updateInfo,
    progress,
    errorMessage,
    hasService,
    updateNow,
    remindLater,
    restartToApply,
    retry,
  } = useAppUpdateContext();

  const isInteractive = status === 'available' || status === 'ready' || status === 'error';
  useFocusTrap(panelRef, isInteractive);

  useEffect(() => {
    if (status !== 'available') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') remindLater();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [status, remindLater]);

  if (!hasService || location.pathname === '/onboarding' || status === 'idle') {
    return null;
  }

  const pct = progressPercent(progress);
  const version = updateInfo?.version ?? '';

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && status === 'available') {
      remindLater();
    }
  };

  return (
    <div
      className={cn(
        'fixed left-4 right-4 z-40 mx-auto max-w-lg',
        'bottom-[68px] md:bottom-4',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300',
      )}
    >
      <div
        ref={panelRef}
        role={isInteractive ? 'dialog' : 'status'}
        aria-modal={isInteractive ? 'false' : undefined}
        aria-live={status === 'downloading' || status === 'restarting' ? 'polite' : undefined}
        onKeyDown={onKeyDown}
        className="air-glass-strong rounded-xl border border-border p-4 shadow-lg"
      >
        {status === 'available' && updateInfo && (
          <>
            <h2 className="text-sm font-semibold text-fg">
              {t('appUpdate.title', { version })}
            </h2>
            {updateInfo.notes && (
              <div className="mt-2">
                <p className="label-caps mb-1 text-[11px]">{t('appUpdate.notesHeading')}</p>
                <pre
                  className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted scrollbar-thin"
                >
                  {updateInfo.notes}
                </pre>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={updateNow}>{t('appUpdate.updateNow')}</Button>
              <Button size="sm" variant="ghost" onClick={remindLater}>
                {t('appUpdate.remindLater')}
              </Button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <div aria-live="polite">
            <p className="text-sm text-fg">{t('appUpdate.downloading')}</p>
            <div className="mt-3 rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
                <span>{t('appUpdate.downloading')}</span>
                {pct !== null && (
                  <span className="font-mono">{t('appUpdate.downloadPct', { pct })}</span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-indigo-500 motion-safe:transition-[width] motion-safe:duration-200"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {status === 'ready' && (
          <>
            <p className="text-sm font-medium text-fg">{t('appUpdate.ready')}</p>
            <div className="mt-4">
              <Button size="sm" onClick={restartToApply}>{t('appUpdate.restartToApply')}</Button>
            </div>
          </>
        )}

        {status === 'restarting' && (
          <div className="flex items-center gap-2 text-sm text-fg" aria-live="polite">
            <Loader2 className="size-4 motion-safe:animate-spin" />
            <span>{t('appUpdate.restarting')}</span>
          </div>
        )}

        {status === 'error' && (
          <>
            <p className="text-sm font-medium text-danger">{t('appUpdate.error')}</p>
            {errorMessage && (
              <p className="mt-1 text-[12.5px] text-muted">{errorMessage}</p>
            )}
            <div className="mt-4">
              <Button size="sm" onClick={retry}>{t('appUpdate.retry')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
