/**
 * `liveApi.telemetry` — backend opt-in status + event submission (#331).
 *
 * The product has two independent gates:
 *
 * 1. **Backend** (`LEXFLOW_TELEMETRY_ENABLED=1`): if the operator
 *    hasn't enabled it, the server returns 202 + `accepted: 0` and
 *    nothing reaches disk. The SPA reads `status()` to show the
 *    user whether their consent is even meaningful right now.
 * 2. **User** (Zustand `telemetryConsent`): if the user hasn't
 *    opted in, the SPA doesn't POST events at all.
 *
 * Events only flow when BOTH are on.
 */

import { http } from './http';

export interface TelemetryStatus {
  enabled: boolean;
}

export interface TelemetryEvent {
  name: string;
  props?: Record<string, unknown>;
}

export interface TelemetryIngestResponse {
  accepted: number;
  enabled: boolean;
}

export const liveTelemetryApi = {
  /** Read the backend opt-in gate. Cheap; safe to poll on Settings open. */
  status: async (): Promise<TelemetryStatus> => {
    return http<TelemetryStatus>('/telemetry/status');
  },
  /**
   * Submit a batch. The backend returns 202 either way; ``accepted``
   * reports how many actually reached disk. The SPA fires this only
   * after the user has opted in (Zustand ``telemetryConsent``).
   */
  events: async (events: TelemetryEvent[]): Promise<TelemetryIngestResponse> => {
    return http<TelemetryIngestResponse>('/telemetry/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
