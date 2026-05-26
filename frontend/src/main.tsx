import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import './lib/store'; // side-effect: sync theme attribute
import './i18n'; // side-effect: initialize i18next before render
import { App } from './App';
import { ErrorBoundary } from './components/shell/ErrorBoundary';
import { Toaster } from './components/shell/Toaster';
import { ApiError } from './lib/api';
import { toast } from './lib/toast';

/**
 * Surface API failures as toasts instead of letting them disappear into
 * console.warn (issue #88).
 *
 * Tone policy:
 *   * 4xx that's the user's fault (400/422 validation) → ``warning``.
 *   * 4xx that's a "missing" answer (404) → ``info`` (skip the toast for
 *     404s on detail screens that already render an empty state).
 *   * 401/403 / 5xx / network → ``danger``.
 *
 * Returns the `Toast` payload or `null` when the error is intentionally
 * silent (e.g. 404 on the law detail page — the page itself handles it).
 */
function toastForError(error: unknown): { tone: 'warning' | 'danger' | 'info'; title: string; message: string } | null {
  if (error instanceof ApiError) {
    if (error.status === 404) return null; // pages render their own empty state
    if (error.status === 401 || error.status === 403) {
      return { tone: 'danger', title: 'Acceso denegado', message: error.detail };
    }
    if (error.status === 422 || error.status === 400) {
      return { tone: 'warning', title: 'Petición inválida', message: error.detail };
    }
    if (error.status >= 500) {
      return { tone: 'danger', title: `Error ${error.status}`, message: error.detail };
    }
    return { tone: 'warning', title: `Error ${error.status}`, message: error.detail };
  }
  // Network / abort / unknown — usually means the backend is down.
  const message = error instanceof Error ? error.message : 'Error desconocido';
  return { tone: 'danger', title: 'No se pudo conectar', message };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      const payload = toastForError(error);
      if (payload) toast(payload);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const payload = toastForError(error);
      if (payload) toast(payload);
    },
  }),
});

// Vite exposes the configured `base` here. Strip the trailing slash so React
// Router accepts it as a basename.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={basename}><App /></BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
