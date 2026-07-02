/**
 * `liveApi.departments` — `[{department, count}]` vocabulary ranked by
 * corpus usage (#671 gap B).
 *
 * Empty until the corpus frontmatter carries a `department` field; the
 * endpoint + shape are live so the Explorer department filter works the
 * moment any law is attributed to a ministerio.
 */

import type { ApiClient, DepartmentCount } from '../types';
import { http } from './http';

export const liveDepartmentsApi: ApiClient['departments'] = {
  list: async () => {
    // Sprint 6 api-6 wrapper convention — `{items: [...]}`, mirrors `tags.ts`.
    const raw = await http<{ items: DepartmentCount[] }>('/departments');
    return raw.items;
  },
};
