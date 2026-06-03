/**
 * Floating contextual help drawer (#132).
 *
 * A `?` button anchored to the bottom-right of every page opens a
 * right-side drawer with three sections:
 *   1. **Qué es esta página** — 2-3 sentence description.
 *   2. **Atajos relevantes** — table of hotkeys for the current view.
 *   3. **Repetir tutorial** — re-launches the global 6-step tour
 *      (#116). Per-page mini-tours are tracked separately.
 *
 * Per-page content lives in `HELP_CONTENT` below — a route-prefix to
 * content map. Pages that don't match a prefix fall through to a
 * generic fallback so the drawer never shows an empty body.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Per-page copy or shortcuts → `HELP_CONTENT`.
 * * Drawer placement / visual  → JSX in `HelpDrawer`.
 * * Global hotkeys list        → `GLOBAL_SHORTCUTS`.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpCircle, RotateCcw, X } from 'lucide-react';
import { Button, Kbd } from '@/components/ui';
import { useTutorialRelaunch } from '@/components/domain/TutorialTour';
import { cn, modKey } from '@/lib/utils';

interface HelpPageContent {
  title: string;
  description: string;
  shortcuts: HelpShortcut[];
}

interface HelpShortcut {
  keys: string[];
  label: string;
}

// Shortcuts that exist on every page. Per-route content can override
// or extend these; the drawer renders the per-route shortcuts FIRST
// (most relevant) then the globals.
const GLOBAL_SHORTCUTS: HelpShortcut[] = [
  { keys: [modKey, 'K'], label: 'Abrir la paleta de comandos' },
  { keys: [modKey, '\\'], label: 'Plegar / desplegar la barra lateral' },
  { keys: [modKey, '.'], label: 'Cambiar tema claro / oscuro' },
];

const NAV_SHORTCUTS: HelpShortcut[] = [
  { keys: ['g', 'h'], label: 'Inicio' },
  { keys: ['g', 'e'], label: 'Explorador' },
  { keys: ['g', 'g'], label: 'Grafo' },
  { keys: ['g', 'c'], label: 'Chat' },
  { keys: ['g', 'd'], label: 'Cuadros' },
  { keys: ['g', 's'], label: 'Ajustes' },
];

// Each entry's key is a path PREFIX (longest match wins). Sub-routes
// inherit the closest match. New top-level page → add one entry.
const HELP_CONTENT: Array<readonly [string, HelpPageContent]> = [
  [
    '/home',
    {
      title: 'Inicio',
      description:
        'Tu punto de partida. Resume las últimas leyes publicadas, los temas con más actividad y los grafos sugeridos. Usa la paleta (Ctrl K) para saltar a cualquier ley desde aquí.',
      shortcuts: NAV_SHORTCUTS,
    },
  ],
  [
    '/explorer',
    {
      title: 'Explorador',
      description:
        'Lista completa de leyes con filtros por rango, estado, jurisdicción y etiquetas. Cada fila se abre en la vista de detalle; los filtros se combinan con AND.',
      shortcuts: [
        { keys: [modKey, 'K'], label: 'Buscar por título, BOE o #tag' },
        { keys: ['/'], label: 'Foco en el input de búsqueda' },
        ...NAV_SHORTCUTS,
      ],
    },
  ],
  [
    '/laws/',
    {
      title: 'Detalle de la ley',
      description:
        'Texto consolidado de la norma con anclas por artículo, jerarquía a la izquierda y referencias salientes a la derecha. Cambia el tamaño de lectura en Ajustes → Apariencia.',
      shortcuts: [
        { keys: ['g', 'g'], label: 'Saltar al grafo de esta ley' },
        { keys: ['g', 'e'], label: 'Volver al explorador' },
      ],
    },
  ],
  [
    '/graph',
    {
      title: 'Grafo de referencias',
      description:
        'Cada nodo es una ley; las aristas son citas, modificaciones o derogaciones entre normas. Arrastra para mover, rueda para zoom; el panel derecho fija la profundidad de exploración.',
      shortcuts: [
        { keys: ['+'], label: 'Zoom in' },
        { keys: ['-'], label: 'Zoom out' },
        { keys: ['0'], label: 'Reset zoom' },
        ...NAV_SHORTCUTS,
      ],
    },
  ],
  [
    '/chat',
    {
      title: 'Chat legal',
      description:
        'Conversa con un modelo (local o en nube) que tiene acceso al corpus de leyes. Las respuestas vienen con citas; cada cita es clickable y abre la ley en el panel lateral.',
      shortcuts: [
        { keys: ['Enter'], label: 'Enviar mensaje' },
        { keys: ['Shift', 'Enter'], label: 'Salto de línea sin enviar' },
        { keys: [modKey, 'N'], label: 'Conversación nueva' },
        ...NAV_SHORTCUTS,
      ],
    },
  ],
  [
    '/dashboards',
    {
      title: 'Cuadros',
      description:
        'Dashboards agregados sobre el corpus: distribución por rango, ritmo de reformas, jurisdicciones. Útiles para tener una panorámica antes de bucear en una ley concreta.',
      shortcuts: NAV_SHORTCUTS,
    },
  ],
  [
    '/settings',
    {
      title: 'Ajustes',
      description:
        'Configura personalización (nombre, idioma), apariencia, modelos de chat, servidores MCP y datos. Todo persiste en local; sin cuenta.',
      shortcuts: NAV_SHORTCUTS,
    },
  ],
];

const FALLBACK_CONTENT: HelpPageContent = {
  title: 'LexFlow',
  description:
    'Plataforma open source para explorar y analizar la legislación española. Usa la paleta de comandos (Ctrl K) para saltar a cualquier sitio.',
  shortcuts: NAV_SHORTCUTS,
};

function resolveContent(pathname: string): HelpPageContent {
  // Longest-prefix match. Iterate from longest to shortest so e.g.
  // `/laws/BOE-A-2000-323` hits `/laws/` before falling through to
  // the generic.
  const sorted = [...HELP_CONTENT].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, content] of sorted) {
    if (pathname.startsWith(prefix)) return content;
  }
  return FALLBACK_CONTENT;
}

// ─── Component ───────────────────────────────────────────────────────────

export function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const relaunchTutorial = useTutorialRelaunch();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape; closing the global tutorial would also fire here
  // but it captures Esc first, so the drawer stays robust.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Move focus into the drawer when it opens so screen readers + keyboard
  // users land in the right context. Returning focus on close is handled
  // by the button retaining browser focus after the dialog unmounts.
  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  const content = resolveContent(location.pathname);
  const allShortcuts = [...content.shortcuts, ...GLOBAL_SHORTCUTS];

  return (
    <>
      {/* Floating trigger — anchored bottom-right, above the mobile
          bottom-tab-bar (BottomTabBar sits at ~56 px). */}
      <button
        type="button"
        aria-label="Abrir ayuda contextual"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-30 hidden size-11 items-center justify-center',
          'rounded-full border border-border-strong bg-surface text-fg shadow-lg',
          'transition-colors hover:bg-surface-2 hover:border-indigo-500/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          // The mobile floating search button (in AppShell) also sits in
          // the bottom-right corner. Push help up a row on `md+` and
          // hide on mobile entirely to avoid stacking.
          'md:inline-flex',
        )}
      >
        <HelpCircle className="size-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Ayuda: ${content.title}`}
          className="fixed inset-0 z-[50] bg-black/30 backdrop-blur-[2px]"
          onClick={(e) => {
            // Click on the backdrop dismisses; click inside the panel
            // bubbles to the inner stopPropagation guard.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={drawerRef}
            tabIndex={-1}
            className={cn(
              'absolute right-0 top-0 h-full w-full max-w-md bg-bg shadow-2xl',
              'flex flex-col border-l border-border',
              'animate-in slide-in-from-right duration-200',
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="label-caps text-muted">Ayuda</div>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  {content.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar ayuda"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
              <section>
                <h3 className="label-caps mb-2">Qué es esta página</h3>
                <p className="text-[13.5px] leading-relaxed text-fg">{content.description}</p>
              </section>

              <section className="mt-6">
                <h3 className="label-caps mb-2">Atajos relevantes</h3>
                <ul className="flex flex-col gap-1.5">
                  {allShortcuts.map((shortcut, i) => (
                    <li
                      key={`${shortcut.label}-${i}`}
                      className="flex items-center justify-between gap-3 text-[12.5px]"
                    >
                      <span className="text-fg">{shortcut.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {shortcut.keys.map((k, idx) => (
                          <Kbd key={`${k}-${idx}`}>{k}</Kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-6">
                <h3 className="label-caps mb-2">Tutorial</h3>
                <p className="mb-2 text-[12.5px] text-muted">
                  El tour de 6 pasos repasa el layout, los atajos y las secciones principales. Lo puedes lanzar de nuevo en cualquier momento.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RotateCcw className="size-3.5" />}
                  onClick={() => {
                    setOpen(false);
                    relaunchTutorial();
                  }}
                >
                  Repetir tutorial
                </Button>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
