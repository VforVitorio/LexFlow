/**
 * `liveApi.system` — process introspection.
 *
 * Two endpoints:
 *   - `warmup` (#222): three-tier warm-up progress polled by SplashGate.
 *   - `whatsNew` (#228): corpus diff since the last recorded commit,
 *     consumed by the WhatsNewPanel inside SplashGate.
 *
 * Both flip snake_case wire → camelCase SPA shape.
 */

import type { BackendWarmupStatus, BackendWhatsNewResponse } from '../../api';
import type { ApiClient } from '../types';
import { http } from './http';

export const liveSystemApi: ApiClient['system'] = {
  warmup: async () => {
    const raw = await http<BackendWarmupStatus>('/system/warmup');
    return {
      ready: raw.ready,
      metadataReady: raw.metadata_ready,
      searchReady: raw.search_ready,
      graphReady: raw.graph_ready,
      error: raw.error ?? null,
      durationsSeconds: raw.durations_seconds ?? {},
    };
  },
  whatsNew: async (since: string | null) => {
    const url = since ? `/system/whats-new?since=${encodeURIComponent(since)}` : '/system/whats-new';
    const raw = await http<BackendWhatsNewResponse>(url);
    const corpus = raw.corpus;
    return {
      fromCommit: corpus.from_commit ?? null,
      toCommit: corpus.to_commit ?? null,
      added: (corpus.added ?? []).map((l) => ({ lawId: l.law_id, title: l.title ?? null })),
      modified: (corpus.modified ?? []).map((l) => ({ lawId: l.law_id, title: l.title ?? null })),
      removed: corpus.removed ?? [],
    };
  },
};
