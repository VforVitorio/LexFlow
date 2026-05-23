import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable' | 'cozy';

/**
 * Global UI state. Persisted to localStorage so reloads keep the user's
 * preferences (theme, panels, density). Anything app-specific that isn't a
 * preference goes through TanStack Query instead.
 */
interface UiState {
  theme: Theme;
  setTheme(t: Theme): void;
  toggleTheme(): void;

  /** Left rail expanded vs. icon-only. */
  leftExpanded: boolean;
  toggleLeft(): void;

  /** Right rail visible. */
  rightOpen: boolean;
  toggleRight(): void;

  /** Table density (mostly for the Explorer). */
  density: Density;
  setDensity(d: Density): void;

  /** Reading column font-size override on the Law detail page. */
  readingSize: number;
  setReadingSize(n: number): void;

  /** Command palette open. */
  paletteOpen: boolean;
  setPaletteOpen(open: boolean): void;
  togglePalette(): void;

  /** Default chat model (id). */
  defaultModel: string;
  setDefaultModel(id: string): void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      leftExpanded: true,
      toggleLeft: () => set((s) => ({ leftExpanded: !s.leftExpanded })),

      rightOpen: true,
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),

      density: 'comfortable',
      setDensity: (d) => set({ density: d }),

      readingSize: 16,
      setReadingSize: (n) => set({ readingSize: Math.min(22, Math.max(14, n)) }),

      paletteOpen: false,
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

      defaultModel: import.meta.env.VITE_DEFAULT_MODEL || 'claude-sonnet-4-5',
      setDefaultModel: (id) => set({ defaultModel: id }),
    }),
    {
      name: 'lexflow.ui',
      // Only persist user preferences. Transient UI flags (palette open,
      // last drag position, etc.) live in memory only.
      partialize: (s) => ({
        theme: s.theme,
        leftExpanded: s.leftExpanded,
        rightOpen: s.rightOpen,
        density: s.density,
        readingSize: s.readingSize,
        defaultModel: s.defaultModel,
      }),
    }
  )
);

/**
 * Side-effect: keep <html data-theme> in sync with the store.
 *
 * When the user toggles the theme we wrap the attribute flip in the View
 * Transitions API where available. The browser snapshots the page, applies
 * the change, and cross-fades between the two — a calm "mindfulness" feel
 * that beats any CSS keyframe we could hand-write. Browsers without the API
 * just snap the attribute (no regression).
 *
 * The fade CSS lives in `frontend/src/index.css` (::view-transition-* +
 * `.theme-fade-paint` fallback rules).
 */
if (typeof window !== 'undefined') {
  const root = document.documentElement;
  const apply = (t: Theme) => root.setAttribute('data-theme', t);

  // Honour the persisted theme on first paint (no animation — the user
  // hasn't done anything yet).
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
      // Fallback for Firefox + older Safari: brief opacity flash on the
      // root, then a slow colour transition handled by index.css.
      root.classList.add('theme-fade-paint');
      apply(s.theme);
      window.setTimeout(() => root.classList.remove('theme-fade-paint'), 480);
    }
  });
}
