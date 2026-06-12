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

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { TourProvider, useTour, type StepType } from '@reactour/tour';

// Spotlight padding around the target rect, and the dim wash colour (#575).
const SPOTLIGHT_PAD = 8;
const SPOTLIGHT_DIM = 'hsl(222 30% 6% / 0.72)';

/**
 * Self-rendered tour spotlight (#575).
 *
 * Reactour's built-in SVG mask collapses to 0×0 in this app's `h-full` /
 * `#root` layout, so the dim never appears. This component sidesteps it: it
 * reads the active step's `selector`, measures the real target rect, and
 * paints a fixed div whose huge `box-shadow` darkens everything *except* the
 * rounded cut-out over the target. Sits just under Reactour's popover.
 *
 * The intro step (`selector: 'body'`) gets no cut-out on purpose — it's a
 * centred welcome, not a "look here" moment.
 */
function TourSpotlight() {
  const { isOpen, currentStep, steps } = useTour();
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setRect(null);
      return;
    }
    const selector = steps?.[currentStep]?.selector;
    if (typeof selector !== 'string' || selector === 'body') {
      setRect(null);
      return;
    }
    const target = document.querySelector(selector);
    if (!target) {
      setRect(null);
      return;
    }
    const measure = () => setRect(target.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, currentStep, steps]);

  if (!isOpen || !rect) return null;
  // Dim with four solid rects around the target (top / bottom / left / right)
  // rather than one giant box-shadow — browsers cap shadow spread, so the
  // shadow trick paints nothing past a point. Four rects always fill. A fifth
  // transparent div draws the indigo ring on the cut-out. Portaled to <body>
  // so no transformed ancestor clips them.
  const hole = {
    top: rect.top - SPOTLIGHT_PAD,
    left: rect.left - SPOTLIGHT_PAD,
    width: rect.width + SPOTLIGHT_PAD * 2,
    height: rect.height + SPOTLIGHT_PAD * 2,
  };
  const dim: React.CSSProperties = { position: 'fixed', background: SPOTLIGHT_DIM, zIndex: 99998, pointerEvents: 'none' };
  return createPortal(
    <div aria-hidden>
      {/* top */}
      <div style={{ ...dim, top: 0, left: 0, width: '100vw', height: Math.max(0, hole.top) }} />
      {/* bottom */}
      <div style={{ ...dim, top: hole.top + hole.height, left: 0, width: '100vw', bottom: 0 }} />
      {/* left */}
      <div style={{ ...dim, top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
      {/* right */}
      <div style={{ ...dim, top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
      {/* ring on the spotlit target */}
      <div
        style={{
          position: 'fixed',
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          borderRadius: 12,
          boxShadow: 'inset 0 0 0 1.5px hsl(252 95% 65% / 0.9)',
          zIndex: 99998,
          pointerEvents: 'none',
        }}
      />
    </div>,
    document.body,
  );
}

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
        // Acrylic/glass popover (#575) — translucent surface + backdrop blur,
        // matching the app's `air-glass` treatment instead of a flat box.
        popover: (base) => ({
          ...base,
          background: 'hsl(var(--surface) / 0.82)',
          backdropFilter: 'blur(16px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
          color: 'hsl(var(--fg))',
          borderRadius: '1rem',
          padding: '1.25rem 1.25rem 1rem',
          maxWidth: 380,
          border: '1px solid hsl(var(--border-strong))',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.28)',
        }),
        // Hide Reactour's built-in mask entirely. Its full-screen SVG renders
        // on top of everything (z 99999) but its dim never paints in this
        // app's layout, and left visible it sits over our own <TourSpotlight>.
        // We paint the spotlight ourselves below.
        maskWrapper: (base) => ({ ...base, display: 'none' }),
        badge: (base) => ({
          ...base,
          backgroundColor: 'hsl(252, 95%, 60%)',
        }),
        dot: (base, state) => ({
          ...base,
          width: 7,
          height: 7,
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
      // Custom nav (#575): a ghost "Atrás" and a primary "Siguiente", with
      // the last step ending on an explicit "¡Listo! A disfrutar" CTA so the
      // tour finishes on a clear completion moment instead of just stopping.
      prevButton={({ currentStep, setCurrentStep }) =>
        currentStep === 0 ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
            className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Atrás
          </button>
        )
      }
      nextButton={({ currentStep, stepsLength, setCurrentStep, setIsOpen }) => {
        const isLast = currentStep === stepsLength - 1;
        return (
          <button
            type="button"
            onClick={() => (isLast ? setIsOpen(false) : setCurrentStep((s) => Math.min(stepsLength - 1, s + 1)))}
            className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            {isLast ? '¡Listo! A disfrutar' : 'Siguiente'}
          </button>
        );
      }}
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
      <TourSpotlight />
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
