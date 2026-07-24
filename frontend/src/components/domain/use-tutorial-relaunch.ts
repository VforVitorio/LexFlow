/**
 * Imperative re-launch hook for the onboarding tutorial.
 *
 * Lives in its own module (not in `TutorialTour.tsx`) so that file can
 * stay a pure component module — react-refresh only fast-refreshes files
 * whose exports are all components. Wired to the "Repetir tutorial" button
 * in Settings → Ayuda and the Help drawer.
 *
 * Drives the tour through a Zustand flag (`requestTour`) instead of
 * `@reactour`'s `useTour`, so callers — the eagerly-loaded Help drawer and
 * the lazy Settings page — don't pull `@reactour/tour` into their bundle.
 * The tour provider is mounted lazily as a sibling overlay (#712), so it is
 * NOT an ancestor of these callers and `useTour` would not resolve here.
 */

import { useUi } from '@/lib/store';

import { TUTORIAL_COMPLETED_STORAGE_KEY } from './tutorial-storage';

/**
 * Returns a callback that clears the completed flag and requests a tour
 * relaunch. Idempotent — the next close re-marks the flag.
 */
export function useTutorialRelaunch() {
  const requestTour = useUi((s) => s.requestTour);
  return () => {
    try {
      localStorage.removeItem(TUTORIAL_COMPLETED_STORAGE_KEY);
    } catch {
      /* private mode — ignore */
    }
    requestTour();
  };
}
