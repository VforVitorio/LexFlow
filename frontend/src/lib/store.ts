import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable' | 'cozy';

// Left rail drag-resize bounds (#594). Default matches the old fixed
// `w-[220px]`; the clamp keeps the rail usable (never narrower than the
// nav labels, never wide enough to swallow the content column). Exported so
// the rail's ARIA value range stays in lockstep with the clamp.
export const LEFT_RAIL_MIN = 180;
export const LEFT_RAIL_MAX = 420;
const LEFT_RAIL_DEFAULT = 220;

// Right contextual panel drag-resize bounds (#594). Default matches the
// old fixed `w-[340px]`.
export const RIGHT_RAIL_MIN = 280;
export const RIGHT_RAIL_MAX = 620;
const RIGHT_RAIL_DEFAULT = 340;

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

  /** Left rail width in px when expanded (drag-resizable, #594). */
  leftWidth: number;
  setLeftWidth(px: number): void;

  /** Right rail visible (docked panel on desktop). */
  rightOpen: boolean;
  toggleRight(): void;
  setRight(open: boolean): void;

  /**
   * Mobile-only right panel (bottom sheet), separate from the persisted
   * desktop `rightOpen`. Kept OUT of `partialize` so a fresh mobile visit
   * never auto-opens the sheet over the page (it would sit behind a scrim,
   * hiding the law/chat/graph the user came to see — #826 M3).
   */
  mobileRightOpen: boolean;
  toggleMobileRight(): void;
  setMobileRight(open: boolean): void;

  /** Right rail width in px when docked on desktop (drag-resizable, #594). */
  rightWidth: number;
  setRightWidth(px: number): void;

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

  /**
   * User-side consent for opt-in telemetry (#331 SPA gate).
   *
   * Off by default. Even with this on, events only ship when the
   * backend env ``LEXFLOW_TELEMETRY_ENABLED=1`` is also set — the
   * two flags are intentionally independent (operator + user gates).
   */
  telemetryConsent: boolean;
  setTelemetryConsent(value: boolean): void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),

      leftExpanded: true,
      toggleLeft: () => set((s) => ({ leftExpanded: !s.leftExpanded })),

      leftWidth: LEFT_RAIL_DEFAULT,
      setLeftWidth: (px) =>
        set({ leftWidth: Math.min(LEFT_RAIL_MAX, Math.max(LEFT_RAIL_MIN, Math.round(px))) }),

      rightOpen: true,
      toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
      setRight: (open) => set({ rightOpen: open }),

      mobileRightOpen: false,
      toggleMobileRight: () => set((s) => ({ mobileRightOpen: !s.mobileRightOpen })),
      setMobileRight: (open) => set({ mobileRightOpen: open }),

      rightWidth: RIGHT_RAIL_DEFAULT,
      setRightWidth: (px) =>
        set({ rightWidth: Math.min(RIGHT_RAIL_MAX, Math.max(RIGHT_RAIL_MIN, Math.round(px))) }),

      density: 'comfortable',
      setDensity: (d) => set({ density: d }),

      readingSize: 16,
      setReadingSize: (n) => set({ readingSize: Math.min(22, Math.max(14, n)) }),

      paletteOpen: false,
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

      // Empty by default — ChatPage auto-selects the first *available*
      // model from /models once it loads. The old hardcoded
      // 'claude-sonnet-4-5' default made chat POST an unconfigured cloud
      // model (no API key) so every reply silently failed (#564).
      defaultModel: import.meta.env.VITE_DEFAULT_MODEL || '',
      setDefaultModel: (id) => set({ defaultModel: id }),

      telemetryConsent: false,
      setTelemetryConsent: (value) => set({ telemetryConsent: value }),
    }),
    {
      name: 'lexflow.ui',
      // Only persist user preferences. Transient UI flags (palette open,
      // last drag position, etc.) live in memory only.
      partialize: (s) => ({
        theme: s.theme,
        leftExpanded: s.leftExpanded,
        leftWidth: s.leftWidth,
        rightOpen: s.rightOpen,
        rightWidth: s.rightWidth,
        density: s.density,
        readingSize: s.readingSize,
        defaultModel: s.defaultModel,
        telemetryConsent: s.telemetryConsent,
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
