/**
 * Imperative re-launch hook for the onboarding tutorial.
 *
 * Lives in its own module (not in `TutorialTour.tsx`) so that file can
 * stay a pure component module — react-refresh only fast-refreshes files
 * whose exports are all components. Wired to the "Repetir tutorial"
 * button in Settings → Ayuda.
 */

import { useTour } from '@reactour/tour';

import { TUTORIAL_COMPLETED_STORAGE_KEY } from './TutorialTour';

/**
 * Returns a callback that clears the completed flag and reopens the tour.
 * Idempotent — the next close re-marks the flag.
 */
export function useTutorialRelaunch() {
  const { setIsOpen } = useTour();
  return () => {
    try {
      localStorage.removeItem(TUTORIAL_COMPLETED_STORAGE_KEY);
    } catch {
      /* private mode — ignore */
    }
    setIsOpen(true);
  };
}
