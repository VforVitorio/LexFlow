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
  list: async () => http<Array<{ tag: string; count: number }>>('/tags'),
};
