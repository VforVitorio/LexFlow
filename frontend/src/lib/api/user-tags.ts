/**
 * `liveApi.userTags` — custom user tags on laws (#670).
 *
 * Unlike `liveApi.tags` (the corpus tag vocabulary derived from BOE
 * frontmatter, read-only), user tags are freeform labels a user attaches
 * to a law locally — CRUD lives here.
 *
 * Wire shapes (backend not yet implemented as of this file — contract
 * agreed up front so the SPA data layer can land ahead of the API):
 *   GET    /laws/{lawId}/user-tags   → {items: [{tag, label}]}
 *   POST   /laws/{lawId}/user-tags   → {tag, label}            body {label}
 *   DELETE /laws/{lawId}/user-tags/{tag} → 204
 *   GET    /user-tags                → {items: [{tag, label, count}]}
 *   GET    /user-tags/{tag}/laws     → {law_ids: [...]}
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend response shape → the inline `Backend*` types + unwrap below.
 * Slug rules (accents/casing) → mirrors `normalize_tag` in
 * `src/lexflow/core/parser.py`; keep `mockApi`'s `slug()` helper in sync.
 */

import type { ApiClient, UserTag } from '../types';
import { http } from './http';

interface BackendUserTag {
  tag: string;
  label: string;
}

interface BackendUserTagCount extends BackendUserTag {
  count: number;
}

export const liveUserTagsApi: ApiClient['userTags'] = {
  forLaw: async (lawId) => {
    const raw = await http<{ items: BackendUserTag[] }>(`/laws/${encodeURIComponent(lawId)}/user-tags`);
    return raw.items;
  },
  add: async (lawId, label) => {
    return http<UserTag>(`/laws/${encodeURIComponent(lawId)}/user-tags`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  },
  remove: async (lawId, tag) => {
    await http<void>(`/laws/${encodeURIComponent(lawId)}/user-tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    });
  },
  vocab: async () => {
    const raw = await http<{ items: BackendUserTagCount[] }>('/user-tags');
    return raw.items;
  },
  lawsFor: async (tag) => {
    const raw = await http<{ law_ids: string[] }>(`/user-tags/${encodeURIComponent(tag)}/laws`);
    return raw.law_ids;
  },
};
