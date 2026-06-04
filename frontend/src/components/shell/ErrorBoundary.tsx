import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Global error boundary (issue #88).
 *
 * Catches uncaught render-time errors anywhere below it and renders a
 * recovery screen with the error detail + a "Reload" button. Without
 * this the app would crash to a blank page on any thrown render error
 * (a stale state shape, a `.map` on undefined, etc.).
 *
 * **Not** for API errors — those are caught by TanStack Query's global
 * `onError` and surface as toasts. This boundary is the safety net for
 * the few cases where the React tree itself throws.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Fallback UI            → ``renderFallback`` below
 * * Telemetry / Sentry     → ``componentDidCatch`` hook
 */

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No external logger wired yet (Sentry / similar is opt-in per
    // CLAUDE.md). For now we log to the console so the error survives
    // a recovery click. When the logger lands, replace this with the
    // real client call.
    console.error('[ErrorBoundary] uncaught render error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="grid h-screen place-items-center bg-bg p-6">
          <div className="max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle className="size-5" />
              <span className="text-base font-semibold">Algo ha fallado</span>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
              La aplicación ha encontrado un error inesperado al renderizar la pantalla. Puedes
              intentar volver atrás o recargar.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border bg-bg p-2 font-mono text-[11.5px] text-fg">
              {this.state.error.message}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={this.reload}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
