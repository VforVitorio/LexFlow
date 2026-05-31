/**
 * First-run welcome flow (#229).
 *
 * Two-step gate shown **after SplashGate ready** and **before App**:
 *
 *   1. Handwritten "Hola, soy LexFlow" rendered via `tegaki`
 *      (one-shot personality moment; the rest of the SPA stays sober
 *      and dense). Implemented in `WelcomeAnimation.tsx`,
 *      **lazy-imported** so returning users never pay the tegaki cost.
 *   2. Name prompt — "¿Cómo deberíamos llamarte?" — fed into
 *      `localStorage['lexflow.user-name']` so the greeting in HomePage
 *      (`lib/greeting.ts`) and #248's randomised welcome pool can
 *      address the user by name.
 *
 * The whole flow is single-use: once `localStorage['lexflow.welcomed']`
 * is `'true'`, the gate renders its children directly. Skipping either
 * step is fine — the disclaimer makes clear no account is needed.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Skip the welcome (tests / dev): set
 *   `localStorage.setItem('lexflow.welcomed', 'true')` before mount.
 * * Different greeting text: change `WELCOME_TEXT` in WelcomeAnimation.
 */

import { lazy, Suspense, useEffect, useState } from 'react';

import { USER_NAME_STORAGE_KEY } from '../../lib/greeting';

// Lazy split so the tegaki bundle + Caveat font only download when a
// first-time user actually reaches the welcome step. Returning users
// never fetch this chunk.
const WelcomeAnimation = lazy(() => import('./WelcomeAnimation'));

const WELCOMED_STORAGE_KEY = 'lexflow.welcomed';

type Phase = 'animating' | 'naming' | 'done';

function readWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_STORAGE_KEY) === 'true';
  } catch {
    // Storage unavailable → don't gate, render the app immediately.
    return true;
  }
}

function markWelcomed(name: string | null): void {
  try {
    if (name) localStorage.setItem(USER_NAME_STORAGE_KEY, name);
    localStorage.setItem(WELCOMED_STORAGE_KEY, 'true');
  } catch {
    /* private mode / sandbox — ignore. */
  }
}

export function WelcomeFlow({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>(() => (readWelcomed() ? 'done' : 'animating'));

  if (phase === 'done') return <>{children}</>;
  if (phase === 'animating') {
    return (
      <Suspense fallback={<div className="fixed inset-0 z-[60] bg-bg" aria-hidden />}>
        <WelcomeAnimation onContinue={() => setPhase('naming')} />
      </Suspense>
    );
  }
  return (
    <NamePromptModal
      onSubmit={(name) => {
        markWelcomed(name);
        setPhase('done');
      }}
    />
  );
}

function NamePromptModal({ onSubmit }: { onSubmit: (name: string | null) => void }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSubmit(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSubmit]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    onSubmit(trimmed.length > 0 ? trimmed : null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="¿Cómo deberíamos llamarte?"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm"
    >
      <form
        onSubmit={submit}
        className="air-glass-strong w-full max-w-md p-7 animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">¿Cómo deberíamos llamarte?</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          No hace falta cuenta — solo para tratarte por tu nombre en los saludos. Puedes saltarlo.
        </p>

        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tu nombre"
          autoFocus
          maxLength={48}
          className="mt-5 w-full rounded-md border border-border-strong bg-bg px-3.5 py-2.5 text-[15px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onSubmit(null)}
            className="text-[13px] text-muted hover:text-fg"
          >
            Saltar
          </button>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            Continuar
          </button>
        </div>
      </form>
    </div>
  );
}
