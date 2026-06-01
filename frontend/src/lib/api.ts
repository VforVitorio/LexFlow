/**
 * LexFlow API client — entry point + `ApiClient` assembly.
 *
 * Each backend resource lives in its own module under `./api/*` so
 * touching one surface doesn't drag the rest. This file's job is:
 *
 *   1. Re-export the shared transport helpers (`http`, `ApiError`,
 *      `USE_MOCK`, `API_BASE`, `API_PREFIX`) so existing call sites
 *      that imported them from `'@/lib/api'` keep working.
 *   2. Compose every `live*Api` resource into a single `liveApi`
 *      object conforming to `ApiClient`.
 *   3. Pick mock vs live based on `VITE_USE_MOCK` and export `api`.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend response shape   → `./api/transformers.ts`
 * Backend enum values      → `RANK_MAP` / `STATUS_MAP` / `SCOPE_MAP` in transformers
 * Backend endpoint paths   → the matching `./api/<resource>.ts`
 * Mock fallback            → `./api.mock.ts`
 * Transport / auth / errors → `./api/http.ts`
 */

import type { ApiClient } from './types';
import { mockApi } from './api.mock';

import { liveArticlesApi } from './api/articles';
import { liveChatApi } from './api/chat';
import { liveDashboardsApi } from './api/dashboards';
import { liveGraphApi } from './api/graph';
import { liveLawsApi } from './api/laws';
import { liveModelsApi } from './api/models';
import { liveSearchApi } from './api/search';
import { liveSyncApi } from './api/sync';
import { liveSystemApi } from './api/system';
import { liveTagsApi } from './api/tags';

// Re-exports for back-compat: existing call sites import these from
// `@/lib/api` directly. The implementations live in `./api/http.ts`.
export { API_BASE, API_PREFIX, ApiError, USE_MOCK, http } from './api/http';
import { USE_MOCK } from './api/http';

const liveApi: ApiClient = {
  laws: liveLawsApi,
  articles: liveArticlesApi,
  tags: liveTagsApi,
  graph: liveGraphApi,
  search: liveSearchApi,
  chat: liveChatApi,
  models: liveModelsApi,
  dashboards: liveDashboardsApi,
  sync: liveSyncApi,
  system: liveSystemApi,
};

// ─── Exported singleton ─────────────────────────────────────────────────

export const api: ApiClient = USE_MOCK ? mockApi : liveApi;

// Re-export for tests / Storybook to compose either client explicitly.
export { liveApi, mockApi };
