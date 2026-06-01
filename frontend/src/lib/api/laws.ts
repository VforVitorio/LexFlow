/**
 * `liveApi.laws` — list / get / versions / diff / references.
 *
 * The backend has no dedicated `/references` endpoint yet, so we
 * derive references from the law-detail payload (#96 will add a
 * proper endpoint; once that lands, swap the implementation here
 * and the rest of the SPA keeps working unchanged).
 */

import type {
  BackendLawDetail,
  BackendLawDiff,
  BackendLawSummary,
  BackendLawVersion,
  BackendPaginated,
} from '../../api';
import type { ApiClient, Law, Paginated } from '../types';
import { http, qs } from './http';
import {
  listLawsQuery,
  transformArticle,
  transformDiff,
  transformLaw,
  transformLawDetail,
  transformVersion,
} from './transformers';

export const liveLawsApi: ApiClient['laws'] = {
  list: async (params = {}) => {
    const data = await http<BackendPaginated<BackendLawSummary>>(`/laws${qs(listLawsQuery(params))}`);
    const result: Paginated<Law> = {
      items: data.items.map(transformLaw),
      total: data.total,
      cursor: data.has_next ? String(data.page + 1) : null,
    };
    return result;
  },
  get: async (id) => {
    const raw = await http<BackendLawDetail>(`/laws/${encodeURIComponent(id)}`);
    return transformLawDetail(raw);
  },
  versions: async (id) => {
    const raw = await http<BackendLawVersion[]>(`/laws/${encodeURIComponent(id)}/versions`);
    return raw.map(transformVersion);
  },
  diff: async (id, fromTag, toTag) => {
    const raw = await http<BackendLawDiff>(
      `/laws/${encodeURIComponent(id)}/diff?from=${encodeURIComponent(fromTag)}&to=${encodeURIComponent(toTag)}`,
    );
    return transformDiff(raw);
  },
  references: async (id) => {
    // No dedicated /references endpoint yet (#96). Derive from the
    // law detail until the backend exposes one.
    const raw = await http<BackendLawDetail>(`/laws/${encodeURIComponent(id)}`);
    return (raw.articles ?? []).filter((a) => (a.references ?? []).length > 0).map((a) => transformArticle(id, a));
  },
};
