/**
 * Handwritten "Hola, soy LexFlow" rendered with tegaki — step 1 of the
 * first-run welcome (#229).
 *
 * Split into its own module so the tegaki bundle + Caveat font (~90 kB
 * gzipped) ship as a separate chunk that loads only when WelcomeFlow
 * actually needs it. Returning users never fetch this code.
 *
 * Default-exported for `React.lazy()` compatibility — the named-export
 * adapter in WelcomeFlow.tsx would require an extra `.then(...)` step
 * we don't need.
 */

import { useState } from 'react';
import { TegakiRenderer } from 'tegaki/react';
import caveat from 'tegaki/fonts/caveat';

const WELCOME_TEXT = 'Hola, soy LexFlow';

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface Props {
  onContinue: () => void;
}

export default function WelcomeAnimation({ onContinue }: Props) {
  const [done, setDone] = useState(false);
  const reduced = prefersReducedMotion();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-10 bg-bg text-fg"
    >
      <div className="flex flex-col items-center gap-6" aria-label={WELCOME_TEXT}>
        {reduced ? (
          // prefers-reduced-motion: skip the stroke animation entirely.
          // Plain text fade-in keeps the welcome moment without movement.
          <h1 className="font-display text-5xl font-semibold tracking-tight animate-in fade-in duration-700">
            {WELCOME_TEXT}
          </h1>
        ) : (
          <TegakiRenderer
            font={caveat}
            style={{ fontSize: '64px', color: 'hsl(var(--fg))' }}
            onComplete={() => setDone(true)}
          >
            {WELCOME_TEXT}
          </TegakiRenderer>
        )}
      </div>

      <div className="flex items-center gap-3">
        {(done || reduced) && (
          <button
            type="button"
            autoFocus
            onClick={onContinue}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 animate-in fade-in duration-500"
          >
            Continuar
          </button>
        )}
        {!done && !reduced && (
          <button
            type="button"
            onClick={onContinue}
            className="text-xs text-muted hover:text-fg"
          >
            Saltar animación
          </button>
        )}
      </div>
    </div>
  );
}
