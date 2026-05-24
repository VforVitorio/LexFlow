import { useEffect, useRef } from 'react';

/**
 * Tracks cursor position over every element with `.spotlight-card` and
 * writes `--mx` / `--my` CSS variables that the `.spotlight-card::before`
 * radial gradient consumes. Single document-level listener covers every
 * card on the page, so no per-card React state.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * CSS rule: landing/src/landing.css   .spotlight-card / .spotlight-card::before
 * Pattern:  buildui.com / Linear / Vercel — see the cozy-web research note.
 */
export function useSpotlightCards() {
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip on touch / coarse pointers — the spotlight needs a hover idiom
    // to make any sense, and `matchMedia('(hover: hover)')` is the same
    // gate the CSS rule uses.
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;

    function onMove(e: PointerEvent) {
      const target = (e.target as Element | null)?.closest('.spotlight-card') as HTMLElement | null;
      if (!target) return;
      // Throttle to requestAnimationFrame so a fast cursor doesn't pump
      // CSS variable writes faster than the browser repaints.
      if (raf.current != null) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        const rect = target.getBoundingClientRect();
        target.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        target.style.setProperty('--my', `${e.clientY - rect.top}px`);
      });
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);
}
