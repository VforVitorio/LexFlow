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
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Stall safety window    → ``ANIMATION_MAX_MS``.
 * * Resilience invariant    → the welcome must NEVER trap the user behind
 *   a stalled animation (#557): a missed ``onComplete`` falls back to the
 *   static heading + Continuar after the cap; a render throw degrades to
 *   the static heading via ``TegakiBoundary`` (NOT the global crash screen).
 */

import { Component, useEffect, useState, type ReactNode } from 'react';
import { TegakiRenderer } from 'tegaki/react';
import caveat from 'tegaki/fonts/caveat';

const WELCOME_TEXT = 'Hola, soy LexFlow';

// tegaki occasionally never fires ``onComplete`` (stalls on some
// machines/fonts). Generous enough not to cut off a real stroke
// animation, short enough that a stall doesn't strand the user (#557).
const ANIMATION_MAX_MS = 4000;

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Silent boundary: a tegaki render throw degrades to the static heading
 * (via ``onError``) instead of bubbling to the global ErrorBoundary's
 * full crash screen. Renders nothing while failed — the parent swaps in
 * the static variant.
 */
class TegakiBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

interface Props {
  onContinue: () => void;
}

export default function WelcomeAnimation({ onContinue }: Props) {
  const [done, setDone] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const reduced = prefersReducedMotion();
  // Static = no stroke animation: reduced-motion preference, OR the
  // animation stalled/threw and we fell back to plain text.
  const showStatic = reduced || animationFailed;
  // "Continuar" is available once the animation is done OR we're static.
  const ready = done || showStatic;

  // Safety net: if the stroke animation never reports completion, fall
  // back to the static heading + Continuar so the user is never stranded
  // (the bug in #557 was a permanent "Saltar"-only screen).
  useEffect(() => {
    if (showStatic || done) return;
    const timer = window.setTimeout(() => {
      setAnimationFailed(true);
      setDone(true);
    }, ANIMATION_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [showStatic, done]);

  const failToStatic = () => {
    setAnimationFailed(true);
    setDone(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-10 bg-bg text-fg"
    >
      <div className="flex flex-col items-center gap-6" aria-label={WELCOME_TEXT}>
        {showStatic ? (
          // Static heading: reduced-motion, or the fallback when the
          // stroke animation stalled/threw. Keeps the welcome moment
          // without movement.
          <h1 className="font-display text-5xl font-semibold tracking-tight animate-in fade-in duration-700">
            {WELCOME_TEXT}
          </h1>
        ) : (
          <TegakiBoundary onError={failToStatic}>
            <TegakiRenderer
              font={caveat}
              style={{ fontSize: '64px', color: 'hsl(var(--fg))' }}
              onComplete={() => setDone(true)}
            >
              {WELCOME_TEXT}
            </TegakiRenderer>
          </TegakiBoundary>
        )}
      </div>

      <div className="flex items-center gap-3">
        {ready ? (
          <button
            type="button"
            autoFocus
            onClick={onContinue}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 animate-in fade-in duration-500"
          >
            Continuar
          </button>
        ) : (
          <button type="button" onClick={onContinue} className="text-xs text-muted hover:text-fg">
            Saltar animación
          </button>
        )}
      </div>
    </div>
  );
}
