/**
 * First-run welcome calligraphy (#595 — replaces the flaky tegaki canvas
 * behind #557).
 *
 * "Hola, soy LexFlow" in the Caveat handwriting font, revealed left-to-
 * right with a GSAP timeline while a pen-tip dot tracks the reveal edge —
 * a robust "being written by hand" effect with no stroke library that can
 * stall. Lazy-imported by WelcomeFlow so returning users never fetch the
 * font + gsap.
 *
 * Invariants:
 * * Never traps the user: reduced-motion → static heading; a font/gsap
 *   failure or the safety timeout falls back to the static heading and
 *   reveals "Continuar".
 * * The phrase is the one personality moment; the rest of the SPA stays
 *   sober and dense.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Reveal feel / duration → ``REVEAL_MS`` + the GSAP timeline easing.
 * * Phrase                 → ``WELCOME_TEXT`` (also update the aria-label).
 * * Font                   → ``@/assets/fonts/caveat.ttf`` (OFL, bundled).
 */

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

import caveatTtf from '@/assets/fonts/caveat.ttf';
import { cn } from '@/lib/utils';

const WELCOME_TEXT = 'Hola, soy LexFlow';
const REVEAL_MS = 2600;
// Never strand the user behind a stalled animation (the original #557 bug):
// if the timeline hasn't completed by here, fall back to static + Continuar.
const SAFETY_MS = REVEAL_MS + 1500;

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// Load the bundled Caveat face once via the FontFace API. A failure is
// swallowed — the text still renders in the system ``cursive`` fallback.
let _fontPromise: Promise<void> | null = null;
function ensureCaveat(): Promise<void> {
  if (_fontPromise) return _fontPromise;
  _fontPromise = (async () => {
    try {
      const face = new FontFace('CaveatLF', `url(${caveatTtf})`);
      await face.load();
      document.fonts.add(face);
    } catch {
      /* fall back to system cursive */
    }
  })();
  return _fontPromise;
}

interface Props {
  onContinue: () => void;
}

export default function WelcomeAnimation({ onContinue }: Props) {
  const [done, setDone] = useState(false);
  const [showStatic, setShowStatic] = useState(prefersReducedMotion);
  const textRef = useRef<HTMLSpanElement>(null);
  const penRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (showStatic) {
      setDone(true);
      return;
    }
    let cancelled = false;
    let ctx: gsap.Context | undefined;
    const safety = window.setTimeout(() => {
      setShowStatic(true);
      setDone(true);
    }, SAFETY_MS);

    void ensureCaveat().then(() => {
      if (cancelled || !textRef.current) return;
      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            window.clearTimeout(safety);
            setDone(true);
          },
        });
        tl.fromTo(
          textRef.current,
          { clipPath: 'inset(0 100% 0 0)' },
          { clipPath: 'inset(0 0% 0 0)', duration: REVEAL_MS / 1000, ease: 'power1.inOut' },
        );
        if (penRef.current) {
          tl.fromTo(
            penRef.current,
            { left: '0%', opacity: 0 },
            { left: '100%', opacity: 1, duration: REVEAL_MS / 1000, ease: 'power1.inOut' },
            0,
          ).to(penRef.current, { opacity: 0, duration: 0.35 });
        }
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
      ctx?.revert();
    };
  }, [showStatic]);

  const ready = done || showStatic;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-10 bg-bg text-fg"
    >
      <div className="relative" aria-label={WELCOME_TEXT}>
        <span
          ref={textRef}
          style={
            showStatic
              ? { fontSize: 'clamp(40px, 9vw, 88px)', lineHeight: 1.1 }
              : { fontFamily: "'CaveatLF', cursive", fontSize: 'clamp(40px, 9vw, 88px)', lineHeight: 1.1 }
          }
          className={cn(
            'block whitespace-nowrap',
            showStatic && 'font-display font-semibold tracking-tight animate-in fade-in duration-700',
          )}
        >
          {WELCOME_TEXT}
        </span>
        {!showStatic && (
          <span
            ref={penRef}
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500 shadow-[0_0_12px_2px] shadow-indigo-500/50"
          />
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
