import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

/**
 * Landing-only theme store.
 *
 * Trimmed-down version of frontend/src/lib/store.ts — the marketing landing
 * does NOT need the SPA's full UI state (left rail, density, palette, model).
 * Just light/dark, persisted to localStorage so reloads remember the choice,
 * and a View-Transitions-API-driven fade on toggle.
 *
 * Persistence key (`lexflow.landing.theme`) is intentionally distinct from
 * the SPA's `lexflow.ui` key so the two surfaces stay fully independent.
 */
interface ThemeStore {
  theme: Theme;
  setTheme(t: Theme): void;
  toggleTheme(): void;
}

export const useUi = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
    }),
    { name: 'lexflow.landing.theme' },
  ),
);

/**
 * Side-effect: keep <html data-theme> in sync with the store.
 *
 * Wraps the attribute flip in the View Transitions API when available so the
 * browser cross-fades between the two themes. Older browsers fall back to a
 * brief opacity overlay defined in index.css (`.theme-fade-paint`).
 */
if (typeof window !== 'undefined') {
  const root = document.documentElement;
  const apply = (t: Theme) => root.setAttribute('data-theme', t);

  apply(useUi.getState().theme);

  useUi.subscribe((s, prev) => {
    if (s.theme === prev.theme) return;
    type ViewTransitionDoc = Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };
    const doc = document as ViewTransitionDoc;
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => apply(s.theme));
    } else {
      root.classList.add('theme-fade-paint');
      apply(s.theme);
      window.setTimeout(() => root.classList.remove('theme-fade-paint'), 480);
    }
  });
}
