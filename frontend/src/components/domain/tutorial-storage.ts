/**
 * Storage key for the onboarding tour's "completed" flag (#116).
 *
 * Lives in its own leaf module — with no `@reactour/tour` dependency — so
 * that consumers like the relaunch hook (and, through it, the eagerly-loaded
 * Help drawer) can read the key WITHOUT statically importing `TutorialTour.tsx`.
 * That import would otherwise pull `@reactour/tour` into the entry bundle,
 * defeating the lazy-mount in #712.
 */
export const TUTORIAL_COMPLETED_STORAGE_KEY = 'lexflow.tutorial-completed';
