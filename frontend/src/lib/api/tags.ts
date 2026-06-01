/**
 * `liveApi.tags` — `[{tag, count}]` vocabulary ranked by corpus usage (#145).
 *
 * Empty until the corpus frontmatter carries tags / categories /
 * keywords; the endpoint + shape are live so the Explorer filter
 * and command palette work the moment any law is tagged.
 */

import type { ApiClient } from '../types';
import { http } from './http';

export const liveTagsApi: ApiClient['tags'] = {
  list: async () => {
    // Sprint 6 api-6 wrapped the response in `{items: [...]}`.
    const raw = await http<{ items: Array<{ tag: string; count: number }> }>('/tags');
    return raw.items;
  },
};
