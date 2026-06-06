/**
 * `liveApi.laws` — list / get / versions / diff / references.
 *
 * `references` hits the dedicated `/laws/{id}/references` endpoint
 * (#96) so a refs-only consumer doesn't have to download the full
 * law body. The detail fetch (`get`) already includes the parsed
 * articles, so the SPA doesn't double-fetch when both are needed.
 */

import type {
  BackendLawDetail,
  BackendLawDiff,
  BackendLawReferencesResponse,
  BackendLawSummary,
  BackendLawVersion,
  BackendPaginated,
} from '../../api';
import type { ApiClient, Law, Paginated } from '../types';
import { http, qs } from './http';
import {
  listLawsQuery,
  transformDiff,
  transformLaw,
  transformLawDetail,
  transformReference,
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
    const raw = await http<BackendLawReferencesResponse>(
      `/laws/${encodeURIComponent(id)}/references`,
    );
    return raw.references.map(transformReference);
  },
};
