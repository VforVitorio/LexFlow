import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

/**
 * Landing-only theme store — hand-rolled, no zustand (#740).
 *
 * The marketing landing only needs light/dark, persisted to localStorage so
 * reloads remember the choice, plus a View-Transitions-API fade on toggle.
 * A 4-line `useSyncExternalStore` external store covers all of that, so the
 * full zustand + persist-middleware dependency was dropped.
 *
 * Persistence key (`lexflow.landing.theme`) is intentionally distinct from the
 * SPA's `lexflow.ui` key so the two surfaces stay fully independent. The value
 * is now the bare string `"light"`/`"dark"` (zustand wrapped it in
 * `{"state":{...},"version":0}`); returning visitors on the old format simply
 * fall back to their system preference once — acceptable for a landing page.
 */
const STORAGE_KEY = 'lexflow.landing.theme';

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStored(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : systemTheme();
}

let theme: Theme = readStored();
const listeners = new Set<() => void>();

/**
 * Flip `<html data-theme>`, wrapped in a View Transition when supported so the
 * browser cross-fades. Older browsers fall back to the brief opacity overlay
 * defined in index.css (`.theme-fade-paint`).
 */
function paint(next: Theme) {
  const root = document.documentElement;
  const apply = () => root.setAttribute('data-theme', next);
  type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => unknown };
  const doc = document as ViewTransitionDoc;
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(apply);
  } else {
    root.classList.add('theme-fade-paint');
    apply();
    window.setTimeout(() => root.classList.remove('theme-fade-paint'), 480);
  }
}

export function setTheme(next: Theme) {
  if (next === theme) return;
  theme = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  paint(next);
  listeners.forEach((notify) => notify());
}

export function toggleTheme() {
  setTheme(theme === 'light' ? 'dark' : 'light');
}

/**
 * Apply the persisted/system theme to `<html>` on first load, without a
 * transition. Called once from main.tsx before render — replaces the old
 * module-load side-effect.
 */
export function initTheme() {
  if (typeof window === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Reactive read of the current theme for components (e.g. the nav toggle). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => theme, () => theme);
}
