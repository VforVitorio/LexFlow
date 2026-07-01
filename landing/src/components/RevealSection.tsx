import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

/**
 * #152 / #739 — fade + slide reveal on first scroll into view.
 *
 * One easing curve, one duration, fires once per load. Pure visual sugar —
 * never changes layout or accessibility behaviour. Replaces the framer-motion
 * implementation with a plain IntersectionObserver + the `.reveal` /
 * `.is-visible` CSS in index.css (no animation library in the bundle).
 *
 * `prefers-reduced-motion` users get `.is-visible` immediately, so nothing
 * animates (the global reduced-motion media query also zeroes the transition).
 * Initial render is always `.reveal` (server + client agree) so hydration over
 * the prerendered markup never mismatches; the effect runs client-side only.
 *
 * The hidden state is CSS-gated behind `html.js` (see index.css + main.tsx), so
 * a run where the bundle never boots — disabled JS, load error, failed
 * hydration — keeps every wrapped section visible instead of blanking the page.
 *
 * Usage: <RevealSection><MyHeavySection /></RevealSection>
 */
export function RevealSection({ children }: PropsWithChildren) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '-40px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? 'reveal is-visible' : 'reveal'}>
      {children}
    </div>
  );
}
