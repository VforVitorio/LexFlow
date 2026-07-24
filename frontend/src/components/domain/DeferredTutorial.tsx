/**
 * Lazy, idle-deferred mount for the onboarding tour (#712).
 *
 * The tour (~50 KB incl. `@reactour/tour`) runs at most once per visitor, so it
 * ships in its own async chunk and mounts as a sibling overlay of `<App/>` only
 * after the browser goes idle — the app paints without it and the chunk never
 * competes with the initial route's fetch. Must be rendered INSIDE the router:
 * the tour's `beforeClose` navigates to /chat.
 */
import { Suspense, lazy, useEffect, useState } from 'react';

const TutorialHost = lazy(() =>
  import('./TutorialTour').then((m) => ({ default: m.TutorialHost })),
);

export function DeferredTutorial() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(() => setReady(true), { timeout: 3000 });
      return () => win.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <TutorialHost />
    </Suspense>
  );
}
