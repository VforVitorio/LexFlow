/**
 * Client-side telemetry firing — closes the Sprint 14 loop on #371.
 *
 * The Settings → Privacidad toggle persists ``telemetryConsent`` to
 * Zustand, but until now nothing in the SPA emitted events. This
 * module fires ``page_view`` on every route change when BOTH gates
 * are on:
 *
 *   1. **Operator** — backend ``LEXFLOW_TELEMETRY_ENABLED=1`` (read
 *      via :func:`useTelemetryStatus`, cached 5 min).
 *   2. **User** — Zustand ``telemetryConsent`` (off by default).
 *
 * Single source of truth for the two-gate model. Adding new events
 * (chat send, MCP install, …) extends :func:`useTelemetryEmit`'s
 * return value.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * New event name        → add a helper on the hook's return type;
 *                            payload shape is free-form ``Record<str, unknown>``
 *                            on the backend (#330).
 * * Batching / debounce   → wrap the POST in a queue here; the public
 *                            ``emit`` API stays the same.
 * * Backend endpoint      → :mod:`lib/api/telemetry` owns the wire shape.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { liveTelemetryApi, type TelemetryEvent } from './api/telemetry';
import { useTelemetryStatus } from './queries';
import { useUi } from './store';

interface TelemetryEmitter {
  /** ``true`` when both operator + user gates allow events to flow. */
  enabled: boolean;
  /** Fire a single event. No-op when ``enabled`` is false. */
  emit(event: TelemetryEvent): void;
}

/**
 * Returns ``{ enabled, emit }``. ``enabled`` re-renders when either
 * gate flips so callers can keep effect dependencies tight; ``emit``
 * is stable and safe to call unconditionally.
 */
export function useTelemetryEmit(): TelemetryEmitter {
  const userConsent = useUi((s) => s.telemetryConsent);
  const { data: backendStatus } = useTelemetryStatus();
  const enabled = userConsent && backendStatus?.enabled === true;

  const emit = useCallback((event: TelemetryEvent) => {
    // Fire-and-forget — backend always returns 202 and the SPA has no
    // recovery path for telemetry failures. Swallow rejections so an
    // unreachable backend doesn't surface a toast (telemetry is opt-in
    // background plumbing, not a user-facing feature).
    void liveTelemetryApi.events([event]).catch(() => undefined);
  }, []);

  return { enabled, emit };
}

/**
 * Side-effect hook — fires a ``page_view`` whenever the router
 * location changes (and once on mount, after both gates resolve).
 * Wire into :func:`App` so it sits inside the ``BrowserRouter``.
 *
 * Captures ``path`` (pathname + search) so we can tell ``/laws/X``
 * apart from ``/laws/Y`` in the aggregate, but does not capture
 * hashes (could carry article anchors / scroll state).
 *
 * Two firing rules cooperate so the effect runs whichever input
 * changes last (initial mount with the gate already on; navigation
 * before the gate flips; opt-in mid-session):
 *
 * * Path change with gates on → fire (with dedup against last path).
 * * Gates flip on while parked on a route → fire once for that route.
 */
export function usePageViewTelemetry(): void {
  const { enabled, emit } = useTelemetryEmit();
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const path = location.pathname + (location.search || '');
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;
    emit({ name: 'page_view', props: { path } });
  }, [enabled, emit, location.pathname, location.search]);
}
