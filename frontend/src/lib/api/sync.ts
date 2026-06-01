/**
 * `liveApi.sync` — legalize-es submodule status + on-demand `git pull` (#86).
 *
 * `GET /sync/status` returns `{ last_sync_at, upstream, behind, busy }`
 * (snake_case wire; SPA uses camelCase). `POST /sync/run` returns 202
 * when it kicked off a pull (or skipped because one's already running)
 * and 409 when a concurrent pull is in flight — 409 bubbles up as
 * `ApiError(.status=409)` so the SPA can show a "sync already running"
 * toast.
 */

import type { ApiClient } from '../types';
import { http } from './http';

export const liveSyncApi: ApiClient['sync'] = {
  status: async () => {
    const raw = await http<{
      last_sync_at: string | null;
      upstream: string;
      behind: number;
      busy: boolean;
    }>('/sync/status');
    return {
      lastSyncAt: raw.last_sync_at,
      upstream: raw.upstream,
      behind: raw.behind,
      busy: raw.busy,
    };
  },
  run: async () => {
    await http<unknown>('/sync/run', { method: 'POST' });
  },
};
