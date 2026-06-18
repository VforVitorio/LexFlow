/**
 * `liveApi.search` — full-text universal search.
 *
 * Canonical route is `/api/v1/laws/search` (#102). The flat
 * `/search` survives as a deprecated alias on the backend; we point
 * the SPA at the nested path to drop off the deprecation curve
 * cleanly.
 *
 * Match offsets (`match_start` / `match_end`, #218) flow through to
 * the SPA as `match: {start, end} | null` so `HighlightedSnippet`
 * can wrap the substring in `<mark>` without re-scanning the snippet.
 */

import type { BackendSearchResponse, BackendSemanticSearchResponse } from '../../api';
import type { ApiClient, HybridSearchResults, SearchFacets, SearchResults, SemanticSearchResults } from '../types';
import { http, qs } from './http';

/**
 * Wire shape of ``GET /api/v1/laws/search/hybrid`` (#43). Kept local —
 * the endpoint post-dates the committed ``schema.ts``, and the shape is
 * small + stable, so a local type avoids a regen round-trip.
 */
interface BackendHybridSearchResponse {
  query: string;
  items: {
    law_id: string;
    article_number: string | null;
    snippet: string;
    score: number;
    sources: string[];
  }[];
}

/**
 * Build the query-string params for `GET /api/v1/laws/search`.
 *
 * The endpoint accepts `q` plus optional facet filters (same names as the
 * list endpoint: rank, status, scope, jurisdiction, year_from, year_to) and
 * pagination (page, page_size). Undefined values are omitted by `qs`.
 */
function buildSearchQuery(q: string, facets: SearchFacets = {}): string {
  return qs({ q, ...facets });
}

export const liveSearchApi: ApiClient['search'] = {
  universal: async (q, facets) => {
    const raw = await http<BackendSearchResponse>(`/laws/search${buildSearchQuery(q, facets)}`);
    const hits: SearchResults['hits'] = raw.items.map((h) => ({
      kind: h.article_number ? 'article' : 'law',
      id: h.article_number ? `${h.law_id}::${h.article_number}` : h.law_id,
      title: h.law_title,
      snippet: h.snippet,
      articleNumber: h.article_number ?? undefined,
      match:
        h.match_start != null && h.match_end != null
          ? { start: h.match_start, end: h.match_end }
          : null,
      payload: { lawId: h.law_id, articleNum: h.article_number ?? undefined },
    }));
    return { hits, total: raw.total };
  },
  /**
   * Audit #477 — semantic search wire-up. Routes to the dedicated
   * ``GET /api/v1/laws/search/semantic`` endpoint that's been live
   * since Sprint 13. Today's backend embedder is a placeholder
   * (HashEmbedder); when the real one lands, this client doesn't
   * change.
   */
  semantic: async (q, opts = {}) => {
    const raw = await http<BackendSemanticSearchResponse>(
      `/laws/search/semantic${qs({ q, limit: opts.limit ?? 10 })}`,
    );
    const hits: SemanticSearchResults['hits'] = raw.items.map((h) => ({
      lawId: h.law_id,
      articleNumber: h.article_number,
      snippet: h.snippet,
      score: h.score,
    }));
    return { hits, query: raw.query };
  },
  /**
   * Hybrid search (#43) — RRF fusion of keyword + semantic. The fused
   * ``score`` is relative-only, so the SPA surfaces ``sources`` instead
   * of a percentage. ``article_number`` may be null (a law-title match).
   */
  hybrid: async (q, opts = {}) => {
    const raw = await http<BackendHybridSearchResponse>(
      `/laws/search/hybrid${qs({ q, limit: opts.limit ?? 10 })}`,
    );
    const hits: HybridSearchResults['hits'] = raw.items.map((h) => ({
      lawId: h.law_id,
      articleNumber: h.article_number,
      snippet: h.snippet,
      score: h.score,
      sources: h.sources,
    }));
    return { hits, query: raw.query };
  },
};
