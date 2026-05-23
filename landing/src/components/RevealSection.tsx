import { motion, useReducedMotion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

/**
 * #152 — fade + slide reveal on first scroll into view.
 *
 * One easing curve, one duration, fires once per session. Pure visual
 * sugar — never changes layout or accessibility behaviour. When the user
 * has opted into `prefers-reduced-motion`, the component renders a plain
 * <section> so nothing moves.
 *
 * Usage:
 *   <RevealSection><MyHeavySection /></RevealSection>
 *
 * Apply to every block below the hero. The hero itself stays uncovered so
 * first paint shows the landing immediately.
 */
export function RevealSection({
  children,
  delay = 0,
  as = 'div',
}: PropsWithChildren<{ delay?: number; as?: 'div' | 'section' }>) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    // Bare wrapper so the rest of the landing's CSS (paddings, ids) still
    // hits the element with the same selectors.
    return as === 'section' ? <section>{children}</section> : <div>{children}</div>;
  }

  const Tag = as === 'section' ? motion.section : motion.div;

  return (
    <Tag
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.9, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </Tag>
  );
}
