import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

/**
 * #157 — Scroll-pinned narrative.
 *
 * A tall outer section (~280vh) with a sticky inner stage. As the user
 * scrolls the page, a single anchor SVG rotates / scales subtly and three
 * captions cross-fade into view to tell the "Markdown → Graph → Chat"
 * story.  A thin progress rail on the right reports how far they are.
 *
 * On `prefers-reduced-motion` the section degrades to a regular static
 * three-card layout — no sticky, no scroll-driven transforms.
 */

interface Scene {
  title: string;
  body: string;
}

const SCENES_FALLBACK_BANDS = [
  [0.0, 0.33],
  [0.33, 0.66],
  [0.66, 1.0],
] as const;

export function HowItWorks() {
  const { t } = useTranslation('landing');
  const ref = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const scenes = t('howItWorks.scenes', { returnObjects: true }) as unknown as Scene[];

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  // Anchor rotates gently across the section + scales 0.92 → 1.02.
  const rotate = useTransform(scrollYProgress, [0, 1], [-6, 6]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.92, 1.02, 0.96]);
  const railProgress = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  // Each scene's opacity follows a triangular band — fades in for the first
  // third of its slot, holds, fades out for the last third.
  function bandOpacity(idx: number) {
    const [a, b] = SCENES_FALLBACK_BANDS[idx];
    const mid = (a + b) / 2;
    const w = (b - a) / 2;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useTransform(scrollYProgress, [a, mid - w * 0.35, mid + w * 0.35, b], [0, 1, 1, 0]);
  }

  // Reduced-motion fallback: render the three scenes side-by-side, no
  // sticky, no scroll.
  if (prefersReducedMotion) {
    return (
      <section id="how" className="hiw-section hiw-static">
        <div className="lf-container">
          <div className="section-eyebrow">
            <span className="dot" />
            <span className="label-caps">{t('howItWorks.eyebrow')}</span>
          </div>
          <h2 className="section-title">{t('howItWorks.title')}</h2>
          <p className="section-sub">{t('howItWorks.sub')}</p>
          <div className="hiw-static-grid">
            {scenes.map((s, i) => (
              <article key={i} className="hiw-static-card">
                <div className="feature-num">{`0${i + 1}`}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const opacity0 = bandOpacity(0);
  const opacity1 = bandOpacity(1);
  const opacity2 = bandOpacity(2);
  const opacities = [opacity0, opacity1, opacity2];

  return (
    <section id="how" className="hiw-section" ref={ref}>
      <div className="hiw-stage">
        <div className="lf-container hiw-stage-inner">
          <div className="hiw-copy">
            <div className="section-eyebrow">
              <span className="dot" />
              <span className="label-caps">{t('howItWorks.eyebrow')}</span>
            </div>
            <h2 className="section-title">{t('howItWorks.title')}</h2>
            <p className="section-sub">{t('howItWorks.sub')}</p>
            <div className="hiw-scenes">
              {scenes.map((s, i) => (
                <motion.div key={i} className="hiw-scene" style={{ opacity: opacities[i] }}>
                  <div className="feature-num">{`0${i + 1}`}</div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div className="hiw-anchor" style={{ rotate, scale }} aria-hidden="true">
            <AnchorSVG />
          </motion.div>
        </div>

        <div className="hiw-rail" aria-hidden="true">
          <div className="hiw-rail-track" />
          <motion.div className="hiw-rail-fill" style={{ height: railProgress }} />
          <span className="hiw-rail-tick" style={{ top: '33%' }} />
          <span className="hiw-rail-tick" style={{ top: '66%' }} />
          <span className="hiw-rail-tick" style={{ top: '100%' }} />
        </div>
      </div>
    </section>
  );
}

function AnchorSVG() {
  // Stylised graph node — three concentric hexagons with edge lines reaching
  // outward. Pure SVG, no library.
  return (
    <svg width="280" height="280" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="hiw-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(252,95%,76%)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(252,95%,76%)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#hiw-glow)" />
      {[60, 38, 22].map((r, i) => (
        <polygon
          key={i}
          points={hex(100, 100, r).join(' ')}
          stroke="currentColor"
          strokeWidth={i === 2 ? 1.8 : 1.2}
          strokeOpacity={0.35 + i * 0.2}
          fill={i === 2 ? 'hsl(var(--violet-500) / 0.18)' : 'none'}
        />
      ))}
      {/* Six outward edges */}
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x1 = 100 + Math.cos(a) * 62;
        const y1 = 100 + Math.sin(a) * 62;
        const x2 = 100 + Math.cos(a) * 92;
        const y2 = 100 + Math.sin(a) * 92;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />;
      })}
    </svg>
  );
}

function hex(cx: number, cy: number, r: number): string[] {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return pts;
}
