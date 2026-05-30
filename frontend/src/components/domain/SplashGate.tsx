/**
 * SplashGate — branded splash that gates the whole app until warm-up is ready.
 *
 * Mounts outside the Router (see main.tsx) so no route renders until the
 * backend's three warm-up stages (metadata → search → graph) complete. On a
 * warm start (disk caches hit, #231/#230) this flashes <500ms; on a cold
 * start it shows a three-segment progress bar so the 30-90s build explains
 * itself instead of a blank screen.
 *
 * Accessibility: rotating stage text is announced via aria-live="polite".
 * Honours prefers-reduced-motion (no pulse animation).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Warm-up fields  → keep in sync with WarmupStatus (lib/types.ts) and
 *                   GET /api/v1/system/warmup (api/routers/system.py).
 */

import React from 'react';

import { useWarmup } from '../../lib/queries';
import type { WarmupStatus } from '../../lib/types';

interface Stage {
  key: keyof Pick<WarmupStatus, 'metadataReady' | 'searchReady' | 'graphReady'>;
  label: string;
}

const STAGES: Stage[] = [
  { key: 'metadataReady', label: 'Indexando 12.236 leyes…' },
  { key: 'searchReady',   label: 'Construyendo índice de búsqueda…' },
  { key: 'graphReady',    label: 'Cargando grafo de referencias…' },
];

function activeStage(warmup: WarmupStatus | undefined): Stage | null {
  if (!warmup) return STAGES[0];
  return STAGES.find((s) => !warmup[s.key]) ?? null;
}

export function SplashGate({ children }: { children: React.ReactNode }) {
  const { data: warmup, isError } = useWarmup();

  if (warmup?.ready) return <>{children}</>;

  return (
    <Splash
      warmup={warmup}
      isError={isError || warmup?.error != null}
      errorMessage={warmup?.error ?? null}
    />
  );
}

function Splash({
  warmup,
  isError,
  errorMessage,
}: {
  warmup: WarmupStatus | undefined;
  isError: boolean;
  errorMessage: string | null;
}) {
  const current = activeStage(warmup);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background text-foreground"
      role="status"
    >
      <h1 className="text-3xl font-semibold tracking-tight">LexFlow</h1>

      {isError ? (
        <SplashError message={errorMessage} />
      ) : (
        <>
          <SegmentBar warmup={warmup} />
          <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
            {current?.label ?? 'Preparando la aplicación…'}
          </p>
        </>
      )}
    </div>
  );
}

function SegmentBar({ warmup }: { warmup: WarmupStatus | undefined }) {
  const current = activeStage(warmup);
  return (
    <div className="flex w-72 gap-1.5" aria-hidden="true">
      {STAGES.map((stage) => {
        const done = warmup?.[stage.key] ?? false;
        const isActive = current?.key === stage.key;
        return (
          <div key={stage.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={[
                'h-full rounded-full bg-primary transition-all duration-500',
                done ? 'w-full' : isActive ? 'w-1/2 motion-safe:animate-pulse' : 'w-0',
              ].join(' ')}
            />
          </div>
        );
      })}
    </div>
  );
}

function SplashError({ message }: { message: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="max-w-sm text-center text-sm text-destructive">
        {message ?? 'No se pudo preparar la aplicación.'}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Reintentar
      </button>
    </div>
  );
}
