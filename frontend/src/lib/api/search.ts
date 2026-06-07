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
import type { ApiClient, SearchResults, SemanticSearchResults } from '../types';
import { http, qs } from './http';

export const liveSearchApi: ApiClient['search'] = {
  universal: async (q) => {
    const raw = await http<BackendSearchResponse>(`/laws/search${qs({ q })}`);
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
};
