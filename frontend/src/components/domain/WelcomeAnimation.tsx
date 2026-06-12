/**
 * First-run welcome calligraphy (#595 → true stroke-draw, #617).
 *
 * "Hola, soy LexFlow" rendered as real SVG glyph paths (extracted from the
 * bundled Caveat handwriting font with opentype.js) and **drawn stroke by
 * stroke** via an animated `stroke-dashoffset` — the iconic macOS "hello"
 * onboarding moment. A pen-tip dot rides the leading edge of the stroke and
 * the ink fills in behind it, so it reads as a hand writing the phrase
 * rather than a left-to-right wipe.
 *
 * Invariants:
 * * Never traps the user: reduced-motion → static heading; a font/opentype/
 *   gsap failure or the safety timeout falls back to the static heading and
 *   reveals "Continuar" (#557).
 * * The phrase is the one personality moment; the rest of the SPA stays
 *   sober and dense.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Draw feel / duration → ``DRAW_MS`` + the GSAP timeline easing.
 * * Phrase                → ``WELCOME_TEXT`` (also update the aria-label).
 * * Font                  → ``@/assets/fonts/caveat.ttf`` (OFL, bundled).
 * * Stroke weight / size  → ``GLYPH_SIZE`` + ``STROKE_WIDTH`` (font units).
 */

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

import caveatTtf from '@/assets/fonts/caveat.ttf';

const WELCOME_TEXT = 'Hola, soy LexFlow';
const DRAW_MS = 3000;
// Never strand the user behind a stalled animation (the original #557 bug):
// if the timeline hasn't completed by here, fall back to static + Continuar.
const SAFETY_MS = DRAW_MS + 1800;

// Internal font units the glyph path is generated at — the SVG viewBox scales
// it responsively, so these only set the stroke-to-glyph ratio.
const GLYPH_SIZE = 120;
const STROKE_WIDTH = 2.4;
const PAD = 16;

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface GlyphGeometry {
  d: string;
  viewBox: string;
}

/**
 * Build the SVG path data + viewBox for the phrase, once.
 *
 * Parses the bundled Caveat face with opentype.js and projects the phrase to
 * a single path (glyph contours come out left-to-right, so a dash-offset draw
 * traces the word in reading order). Cached in a module promise so returning
 * users never re-parse the font. Resolves null on any failure → static
 * fallback.
 */
let _geometryPromise: Promise<GlyphGeometry | null> | null = null;
function ensureGeometry(): Promise<GlyphGeometry | null> {
  if (_geometryPromise) return _geometryPromise;
  _geometryPromise = (async () => {
    try {
      const [{ parse }, buffer] = await Promise.all([
        import('opentype.js'),
        fetch(caveatTtf).then((r) => r.arrayBuffer()),
      ]);
      const font = parse(buffer);
      const path = font.getPath(WELCOME_TEXT, 0, GLYPH_SIZE, GLYPH_SIZE);
      const box = path.getBoundingBox();
      const width = box.x2 - box.x1 + PAD * 2;
      const height = box.y2 - box.y1 + PAD * 2;
      const viewBox = `${box.x1 - PAD} ${box.y1 - PAD} ${width} ${height}`;
      return { d: path.toPathData(2), viewBox };
    } catch {
      return null;
    }
  })();
  return _geometryPromise;
}

interface Props {
  onContinue: () => void;
}

export default function WelcomeAnimation({ onContinue }: Props) {
  const [done, setDone] = useState(false);
  const [showStatic, setShowStatic] = useState(prefersReducedMotion);
  const [geometry, setGeometry] = useState<GlyphGeometry | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const penRef = useRef<SVGCircleElement>(null);

  // Resolve the glyph geometry (or fall back to static on failure).
  useEffect(() => {
    if (showStatic) {
      setDone(true);
      return;
    }
    let cancelled = false;
    void ensureGeometry().then((geo) => {
      if (cancelled) return;
      if (!geo) {
        setShowStatic(true);
        setDone(true);
        return;
      }
      setGeometry(geo);
    });
    return () => {
      cancelled = true;
    };
  }, [showStatic]);

  // Run the stroke-draw once the path is in the DOM.
  useEffect(() => {
    if (!geometry || showStatic) return;
    const path = pathRef.current;
    if (!path) return;

    const safety = window.setTimeout(() => {
      setShowStatic(true);
      setDone(true);
    }, SAFETY_MS);

    let ctx: gsap.Context | undefined;
    try {
      const length = path.getTotalLength();
      ctx = gsap.context(() => {
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length, fillOpacity: 0 });
        const tl = gsap.timeline({
          onComplete: () => {
            window.clearTimeout(safety);
            setDone(true);
          },
        });
        tl.to(path, {
          strokeDashoffset: 0,
          duration: DRAW_MS / 1000,
          ease: 'power1.inOut',
          onUpdate: () => movePenToStrokeTip(path, penRef.current, length),
        });
        // Ink settles in behind the pen, then the pen lifts.
        tl.to(path, { fillOpacity: 1, duration: 0.5, ease: 'power1.out' }, '-=0.35');
        tl.to(penRef.current, { opacity: 0, duration: 0.3 }, '<');
      });
    } catch {
      window.clearTimeout(safety);
      setShowStatic(true);
      setDone(true);
    }

    return () => {
      window.clearTimeout(safety);
      ctx?.revert();
    };
  }, [geometry, showStatic]);

  const ready = done || showStatic;
  const drawing = !!geometry && !showStatic;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-10 bg-bg text-fg"
    >
      <div className="relative w-[min(86vw,720px)]" aria-label={WELCOME_TEXT}>
        {drawing ? (
          <svg
            viewBox={geometry.viewBox}
            className="h-auto w-full text-fg"
            role="img"
            aria-label={WELCOME_TEXT}
          >
            <path
              ref={pathRef}
              d={geometry.d}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              ref={penRef}
              r={STROKE_WIDTH * 1.8}
              className="fill-indigo-500"
              style={{ filter: 'drop-shadow(0 0 6px rgb(99 102 241 / 0.6))' }}
            />
          </svg>
        ) : showStatic ? (
          <span
            style={{ fontSize: 'clamp(40px, 9vw, 88px)', lineHeight: 1.1 }}
            className="block whitespace-nowrap text-center font-display font-semibold tracking-tight animate-in fade-in duration-700"
          >
            {WELCOME_TEXT}
          </span>
        ) : (
          // Geometry still loading: hold the layout height with an invisible
          // copy so the SVG doesn't pop in with a jump — but don't flash the
          // static heading (that's reserved for the reduced-motion / failure
          // path). CodeRabbit #628.
          <span
            aria-hidden
            style={{ fontSize: 'clamp(40px, 9vw, 88px)', lineHeight: 1.1 }}
            className="block whitespace-nowrap text-center font-display font-semibold tracking-tight opacity-0"
          >
            {WELCOME_TEXT}
          </span>
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

/** Park the pen-tip dot on the point the stroke has reached this frame. */
function movePenToStrokeTip(path: SVGPathElement, pen: SVGCircleElement | null, length: number): void {
  if (!pen) return;
  const offset = Number(gsap.getProperty(path, 'strokeDashoffset')) || 0;
  const drawn = length - offset;
  const point = path.getPointAtLength(drawn);
  pen.setAttribute('cx', String(point.x));
  pen.setAttribute('cy', String(point.y));
}
