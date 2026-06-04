/**
 * Onboarding tutorial — 6-step shadowed tour (#116).
 *
 * Auto-runs once on first launch after the welcome flow + model wizard
 * have completed. Re-launchable from Settings → Ayuda. Single
 * source of truth for the step definitions so the Settings page and
 * the auto-trigger logic can't disagree.
 *
 * Stack: `@reactour/tour` (MIT, ~8 KB, ARIA built in). Steps anchor
 * onto `data-tour-id="..."` attributes in the app shell so the tour
 * survives layout refactors without reaching into class names.
 *
 * Accessibility:
 *   - `prefers-reduced-motion: reduce` collapses Reactour's transitions
 *     to instant — the user sees the highlighted box without the
 *     swooping animation.
 *   - Esc closes the tour, focus returns to the body.
 *   - Step 6 finishes with the chat being highlighted; closing it
 *     navigates to the chat route so the wizard is reachable from
 *     where the tour left off.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Add / reorder a step    → `TUTORIAL_STEPS` below; only place that
 *                              matters.
 * * Auto-launch condition   → `<TutorialAutoLauncher>` below.
 * * Re-launch entry point   → `SettingsPage` consumes `useTour()`.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TourProvider, useTour, type StepType } from '@reactour/tour';

export const TUTORIAL_COMPLETED_STORAGE_KEY = 'lexflow.tutorial-completed';

// ─── Steps ───────────────────────────────────────────────────────────────

const STEP_CONTENT = (title: string, body: string) => (
  <div className="space-y-1.5">
    <h3 className="font-display text-[15px] font-semibold tracking-tight">{title}</h3>
    <p className="text-[13px] leading-relaxed text-muted">{body}</p>
  </div>
);

/**
 * Six steps, in the order the user meets the concepts. Each `selector`
 * matches a `data-tour-id` attribute in the shell, not a class. Selectors
 * that fail (e.g. on a viewport where the LeftRail is hidden) are
 * skipped by Reactour automatically.
 */
const TUTORIAL_STEPS: StepType[] = [
  {
    selector: 'body',
    content: STEP_CONTENT(
      '¡Bienvenido a LexFlow!',
      'Un recorrido de un minuto. Verás dónde están las piezas — explorador de leyes, búsqueda, grafo y chat. Pulsa Siguiente para empezar, o Esc en cualquier momento para salir.',
    ),
    position: 'center',
  },
  {
    selector: '[data-tour-id="left-rail"]',
    content: STEP_CONTENT(
      'Navegación principal',
      'Cada sección del producto vive aquí: Inicio, Explorador, Grafo, Chat, Cuadros. Cada una tiene un atajo de dos teclas (g + inicial). Por ejemplo: g c lleva al Chat.',
    ),
    position: 'right',
  },
  {
    selector: '[data-tour-id="search-trigger"]',
    content: STEP_CONTENT(
      'Paleta de comandos',
      'Ctrl K (⌘ K en Mac) abre la paleta universal: busca leyes, salta a una página, ejecuta acciones. Es el atajo más útil del producto.',
    ),
    position: 'bottom',
  },
  {
    selector: '[data-tour-id="search-trigger"]',
    content: STEP_CONTENT(
      'Buscar leyes y artículos',
      'Escribe en la paleta y la búsqueda corre sobre toda la legislación indexada — títulos, artículos, BOE. Los resultados se abren directamente en el explorador.',
    ),
    position: 'bottom',
  },
  {
    selector: '[data-tour-id="left-rail"]',
    content: STEP_CONTENT(
      'Grafo de referencias',
      'El Grafo conecta cada ley con las que la citan o modifica. Útil para entender el contexto de una norma: qué la cita, qué deroga, dónde se inserta. Atajo: g g.',
    ),
    position: 'right',
  },
  {
    selector: '[data-tour-id="left-rail"]',
    content: STEP_CONTENT(
      'Chat legal con tu modelo',
      'El Chat conversa con un modelo local o en nube. Te llevamos ahí al cerrar este tour para que termines de configurar el modelo. Atajo: g c.',
    ),
    position: 'right',
  },
];

// ─── Provider ────────────────────────────────────────────────────────────

function _prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function _markTutorialCompleted() {
  try {
    localStorage.setItem(TUTORIAL_COMPLETED_STORAGE_KEY, 'true');
  } catch {
    /* private mode — ignore */
  }
}

function _readTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_COMPLETED_STORAGE_KEY) === 'true';
  } catch {
    // Storage blocked → don't push the tour again every visit.
    return true;
  }
}

/**
 * Wrap the app with this provider once (high in the tree, after the
 * router because we need `useNavigate` to land on the chat at the end).
 *
 * The provider does NOT auto-start the tour by itself — that's
 * `TutorialAutoLauncher` (mounted alongside) so the Settings page can
 * trigger the tour without us double-binding the auto-launch.
 */
export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const reducedMotion = _prefersReducedMotion();
  const navigate = useNavigate();

  return (
    <TourProvider
      steps={TUTORIAL_STEPS}
      // Reactour exposes a `styles` factory for each surface; we only
      // override the colours so the tour matches the indigo accent the
      // rest of the SPA uses.
      styles={{
        popover: (base) => ({
          ...base,
          backgroundColor: 'hsl(var(--surface))',
          color: 'hsl(var(--fg))',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          maxWidth: 360,
          border: '1px solid hsl(var(--border))',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
        }),
        maskWrapper: (base) => ({
          ...base,
          color: 'rgba(0, 0, 0, 0.55)',
        }),
        badge: (base) => ({
          ...base,
          backgroundColor: 'hsl(252, 95%, 60%)',
        }),
        dot: (base, state) => ({
          ...base,
          backgroundColor: state?.current ? 'hsl(252, 95%, 60%)' : 'hsl(var(--border-strong))',
        }),
      }}
      // Disable Reactour's swoop when the OS asks for reduced motion.
      disableInteraction
      scrollSmooth={!reducedMotion}
      padding={{ mask: 8, popover: 12 }}
      showCloseButton
      showNavigation
      showBadge
      showDots
      onClickClose={({ setIsOpen }) => {
        _markTutorialCompleted();
        setIsOpen(false);
      }}
      onClickMask={({ setIsOpen }) => {
        // Click-outside dismisses; treat as a polite "I get it".
        _markTutorialCompleted();
        setIsOpen(false);
      }}
      afterOpen={() => {
        // Tour starts → freeze body scroll so the highlighted box stays
        // anchored even on long pages.
        document.body.style.overflow = 'hidden';
      }}
      beforeClose={() => {
        document.body.style.overflow = '';
        _markTutorialCompleted();
        // Step 6 ends pointing at the chat — landing the user there is
        // the explicit ask from #116 so the model wizard re-launch is one
        // click away.
        navigate('/chat');
      }}
    >
      {children}
    </TourProvider>
  );
}

// localStorage keys owned by sibling gates (mirrored here verbatim, see
// WelcomeFlow.tsx and ModelWizard.tsx — keep in sync).
const WELCOMED_KEY = 'lexflow.welcomed';
const WIZARD_DONE_KEY = 'lexflow.wizard-completed';

function _readGate(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return true;
  }
}

/**
 * Mount once below `TutorialProvider`. Auto-opens the tour on first
 * launch IF the welcome flow + the model wizard have already completed
 * (we don't want three modals stacking on a fresh install).
 *
 * Reads both completion flags from `localStorage` rather than threading
 * props through `WelcomeFlow` / `ModelWizardGate`, so this component
 * stays orthogonal to those gates' internal state.
 */
export function TutorialAutoLauncher() {
  const { setIsOpen } = useTour();
  useEffect(() => {
    if (_readTutorialCompleted()) return;
    if (!_readGate(WELCOMED_KEY) || !_readGate(WIZARD_DONE_KEY)) return;
    // Tiny delay so the auto-open doesn't fight with the wizard's
    // close animation.
    const timer = window.setTimeout(() => setIsOpen(true), 350);
    return () => window.clearTimeout(timer);
  }, [setIsOpen]);
  return null;
}

// `useTutorialRelaunch` moved to `./use-tutorial-relaunch` so this file
// exports only components (react-refresh). Re-launch consumers import it
// from there.
