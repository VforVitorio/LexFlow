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
 * * Pen smoothness        → ``PEN_SAMPLES`` (higher = smoother but more memory).
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

// Number of {x, y} positions pre-sampled along the path before the animation
// starts. Calling getPointAtLength() every frame forces a layout-equivalent SVG
// measurement on each tick (perf bug). Instead we sample the path ONCE here and
// look up by index in the per-frame callback — zero layout cost per frame.
//
// 600 samples at 60 fps / 3 s = ~180 frames → ~3 samples per rendered frame,
// so interpolation is visually indistinguishable from the continuous version.
const PEN_SAMPLES = 600;

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
      // Real geometry length is needed to pre-sample pen positions; the stroke
      // dash runs in the normalized pathLength=1 space set on the element, so
      // dash values are 0..1 while the pen samples are in real SVG coordinates.
      const length = path.getTotalLength();

      // Pre-sample PEN_SAMPLES+1 points along the path ONCE here, before the
      // animation starts. The per-frame callback then looks up by index — no
      // getPointAtLength() calls during the animation (avoids per-frame layout).
      const penSamples = buildPenSamples(path, length, PEN_SAMPLES);

      ctx = gsap.context(() => {
        gsap.set(path, { strokeDasharray: 1, strokeDashoffset: 1, fillOpacity: 0 });
        // Park the pen on the first pre-sampled point and reveal it, so it
        // rides the stroke from the start instead of flashing at the viewBox
        // origin. penSamples[0] is always the point at distance 0.
        const start = penSamples[0];
        gsap.set(penRef.current, { attr: { cx: start.x, cy: start.y }, opacity: 1 });
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
          onUpdate: () => movePenToStrokeTip(path, penRef.current, penSamples),
        });
        // Ink settles in behind the pen, then the pen lifts.
        tl.to(path, { fillOpacity: 1, duration: 0.5, ease: 'power1.out' }, '-=0.3');
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
              // The FIRST browser paint must already be empty. Normalize the
              // path length to 1 and hide both the stroke (full-length dash,
              // fully offset) and the fill via static attributes — otherwise
              // the complete filled word paints for one frame before the draw
              // effect runs (the "text appears, then paints" bug). GSAP then
              // animates strokeDashoffset 1 → 0 to trace it by hand.
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1}
              fillOpacity={0}
            />
            <circle
              ref={penRef}
              r={STROKE_WIDTH * 1.8}
              className="fill-indigo-500"
              style={{ filter: 'drop-shadow(0 0 6px rgb(99 102 241 / 0.6))' }}
              opacity={0}
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

interface Point {
  x: number;
  y: number;
}

/**
 * Pre-sample the SVG path into a fixed-size array of {x, y} points.
 *
 * Calling getPointAtLength() on every animation frame forces the browser to
 * perform a layout-equivalent geometry measurement each tick — effectively a
 * forced reflow inside the GSAP onUpdate callback. By sampling the full path
 * once up front we pay that cost exactly once and then look up positions in
 * O(1) per frame with no layout involvement.
 *
 * The caller passes the real geometry length (from getTotalLength()) so we
 * distribute samples uniformly across the actual path, not just 0..1.
 */
function buildPenSamples(path: SVGPathElement, length: number, count: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const distance = (i / count) * length;
    const pt = path.getPointAtLength(distance);
    points.push({ x: pt.x, y: pt.y });
  }
  return points;
}

/**
 * Park the pen-tip dot on the point the stroke has reached this frame.
 *
 * Reads the GSAP-managed strokeDashoffset (cheap — no layout), converts the
 * normalized 1→0 offset into a 0..1 progress fraction, then looks up the
 * nearest pre-sampled point. No getPointAtLength() call here — zero per-frame
 * layout cost.
 */
function movePenToStrokeTip(
  path: SVGPathElement,
  pen: SVGCircleElement | null,
  penSamples: Point[],
): void {
  if (!pen || penSamples.length === 0) return;
  // strokeDashoffset runs 1 → 0; (1 - offset) is the fraction drawn so far.
  const offset = Number(gsap.getProperty(path, 'strokeDashoffset')) || 0;
  const progress = Math.min(1, Math.max(0, 1 - offset));
  // Map progress to the nearest index in the pre-sampled array.
  const index = Math.round(progress * (penSamples.length - 1));
  const point = penSamples[index];
  pen.setAttribute('cx', String(point.x));
  pen.setAttribute('cy', String(point.y));
}
