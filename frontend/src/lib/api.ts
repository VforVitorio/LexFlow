/**
 * LexFlow API client.
 *
 * - Single source of truth for backend endpoints. Every route lives under the
 *   `/api/v1/*` prefix to keep versioning honest (see CLAUDE.md §6).
 * - When `VITE_USE_MOCK=true`, the in-process mock implementation is returned
 *   instead of the HTTP client. Both implement the same `ApiClient` interface,
 *   so the rest of the app does not need to know which is active.
 * - Errors are normalised to `ApiError` so consumers can branch on `.status`
 *   and read FastAPI's `{ detail }` body uniformly.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend response shapes  → `transform*` helpers below
 * Backend enum values      → `RANK_MAP`, `STATUS_MAP`, `SCOPE_MAP` below
 * Backend endpoint paths   → the methods of `liveApi`
 * Mock fallback            → `frontend/src/lib/api.mock.ts`
 */

import type {
  Ambito,
  ApiClient,
  Article,
  ArticleDiff,
  ArticleRef,
  ChatChunk,
  ChatMessage,
  ChatThread,
  DashboardData,
  DiffResult,
  GraphData,
  GraphStats,
  GraphTopItem,
  GraphTopMetric,
  HierarchyNode,
  Law,
  LawDetail,
  LawStatus,
  LawVersion,
  ListLawsParams,
  Model,
  Paginated,
  RangoNormativo,
  SearchResults,
  SyncStatus,
} from './types';
import { mockApi } from './api.mock';

// Allow consumers (Settings page) to read whether we're on mock.
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
export const API_BASE = import.meta.env.VITE_API_URL || '';
export const API_PREFIX = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message || `API ${status}`);
  }

  /** Reads FastAPI's `{ detail }` if present; falls back to the message. */
  get detail(): string {
    if (this.body && typeof this.body === 'object' && 'detail' in this.body) {
      const d = (this.body as { detail: unknown }).detail;
      if (typeof d === 'string') return d;
    }
    return this.message;
  }
}

// ─── HTTP client ─────────────────────────────────────────────────────────

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const full = path.startsWith('http') ? path : `${API_BASE}${API_PREFIX}${path}`;
  const res = await fetch(full, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, body, `${init.method || 'GET'} ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x)));
    else u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

// ─── Enum mappings ───────────────────────────────────────────────────────

const RANK_MAP: Record<string, RangoNormativo> = {
  ley: 'Ley',
  ley_organica: 'Ley Orgánica',
  real_decreto: 'Real Decreto',
  real_decreto_ley: 'Real Decreto',
  real_decreto_legislativo: 'RD Legislativo',
  decreto_legislativo: 'RD Legislativo',
  orden: 'Otro',
  otro: 'Otro',
};

const STATUS_MAP: Record<string, LawStatus> = {
  in_force: 'vigente',
  repealed: 'derogada',
  partially_repealed: 'modificada',
  pending: 'pendiente',
};

const SCOPE_MAP: Record<string, Ambito> = {
  Estatal: 'Estatal',
  Autonómico: 'Autonómica',
  Local: 'Local',
};

function buildShortName(raw: { identifier: string; title: string }): string {
  // Drop the leading "Ley Orgánica X/YYYY, de ..." or similar — pick the first
  // 5-6 meaningful tokens after the rank prefix, or fall back to the BOE id.
  const trimmed = raw.title.replace(/^(Ley(\s+Orgánica)?|Real\s+Decreto(\s+Legislativo)?)[^,]*,?\s*(de\s+)?/i, '');
  const head = trimmed.split(/[,.]/, 1)[0].trim();
  if (head.length === 0) return raw.identifier;
  return head.length > 60 ? `${head.slice(0, 57)}…` : head;
}

// ─── Domain transformers ─────────────────────────────────────────────────

interface BackendLawSummary {
  identifier: string;
  title: string;
  rank: string;
  status: string;
  publication_date: string | null;
  article_count: number;
  scope: string;
  jurisdiction: string | null;
}

interface BackendLawDetail {
  metadata: BackendLawSummary & {
    enactment_date: string | null;
    last_updated: string | null;
    source: string | null;
    department: string | null;
    official_journal: string | null;
    journal_issue: string | null;
    consolidation_status: string;
    country: string;
  };
  sections: BackendSection[];
  articles: BackendArticle[];
  references: BackendReference[];
  article_count: number;
}

interface BackendSection {
  level: number;
  heading: string;
  articles: BackendArticle[];
  subsections: BackendSection[];
}

interface BackendArticle {
  number: string;
  title: string | null;
  text: string;
  references: BackendReference[];
}

interface BackendReference {
  target_id: string | null;
  target_text: string;
  source_article: string | null;
}

interface BackendLawVersion {
  commit_hash: string;
  date: string;
  message: string;
  norma: string | null;
  disposicion: string | null;
  articulos_afectados: string[];
}

interface BackendLawDiff {
  law_id: string;
  from_commit: string;
  to_commit: string;
  from_date: string | null;
  to_date: string | null;
  diff_text: string;
  stats: { additions: number; deletions: number; changed_articles: string[] };
}

function transformLaw(raw: BackendLawSummary): Law {
  return {
    id: raw.identifier,
    boe: raw.identifier,
    title: raw.title,
    short: buildShortName(raw),
    status: STATUS_MAP[raw.status] ?? 'pendiente',
    rango: RANK_MAP[raw.rank] ?? 'Otro',
    publicada: raw.publication_date ?? '',
    ambito: SCOPE_MAP[raw.scope] ?? 'Estatal',
    articulos: raw.article_count,
    // The list endpoint does not surface these — fill via the detail endpoint
    // when the user opens a law. Counts are advisory in the Explorer header.
    referencias: 0,
    versiones: 0,
  };
}

function levelToKind(level: number): HierarchyNode['kind'] {
  switch (level) {
    case 2:
      return 'titulo';
    case 3:
      return 'capitulo';
    case 4:
      return 'seccion';
    case 5:
      return 'articulo';
    default:
      return 'disposicion';
  }
}

function sectionToHierarchy(section: BackendSection, path: string): HierarchyNode {
  const id = `${path}::${section.level}-${section.heading}`;
  const children: HierarchyNode[] = [
    ...section.subsections.map((s, i) => sectionToHierarchy(s, `${id}::sub-${i}`)),
    ...section.articles.map((a) => ({
      id: `${id}::art-${a.number}`,
      kind: 'articulo' as const,
      label: `Art. ${a.number}`,
      heading: a.title ?? undefined,
    })),
  ];
  return {
    id,
    kind: levelToKind(section.level),
    label: section.heading,
    heading: section.heading,
    children: children.length ? children : undefined,
  };
}

function transformLawDetail(raw: BackendLawDetail): LawDetail {
  const summary = transformLaw(raw.metadata);
  const hierarchy = raw.sections.map((s, i) => sectionToHierarchy(s, `root-${i}`));
  return {
    ...summary,
    referencias: raw.references.length,
    hierarchy,
  };
}

function transformReference(ref: BackendReference): ArticleRef {
  return {
    label: ref.target_text,
    target: ref.target_id ? { lawId: ref.target_id } : undefined,
    kind: ref.target_id ? 'law' : undefined,
  };
}

function transformArticle(lawId: string, raw: BackendArticle): Article {
  // The backend returns articles as a single text blob. We render it as one
  // unmarked clause for now — proper paragraph + (a) (b) (c) splitting and
  // inline citation handles are tracked separately (see follow-up issue).
  return {
    id: `${lawId}::${raw.number}`,
    lawId,
    num: raw.number,
    titulo: raw.title ?? '',
    body: [
      {
        marker: null,
        text: raw.text,
        citations: raw.references.map(transformReference),
      },
    ],
    refs: raw.references.map(transformReference),
  };
}

// Heuristics for surfacing a useful tag + kind from a git commit message.
// legalize-es commits look like "feat(...): Ley XX/YYYY, de ... (norma=...)".
function deriveVersionKind(message: string): LawVersion['kind'] {
  const m = message.toLowerCase();
  if (/derog|repeal/.test(m)) return 'repeal';
  if (/consolid/.test(m)) return 'consolidate';
  if (/^feat\(publi|public/.test(m)) return 'publish';
  return 'amend';
}

function transformVersion(raw: BackendLawVersion): LawVersion {
  const subject = raw.message.split('\n', 1)[0].trim();
  return {
    tag: raw.commit_hash.slice(0, 7),
    date: raw.date,
    label: raw.disposicion ?? raw.norma ?? subject.slice(0, 80),
    kind: deriveVersionKind(raw.message),
    changedArticles: raw.articulos_afectados.length ? raw.articulos_afectados : undefined,
  };
}

function buildVersionStub(commit: string, date: string | null): LawVersion {
  // When the backend gives us only the commit hash + date for the endpoints
  // of a diff, synthesise a minimal LawVersion so the DiffViewer can render
  // its left/right metadata.
  return {
    tag: commit.slice(0, 7),
    date: date ?? '',
    label: commit.slice(0, 7),
    kind: 'amend',
  };
}

function parseUnifiedDiffLines(text: string): ArticleDiff {
  // The backend returns a single unified diff for the whole file. We surface
  // it as one synthetic article so the DiffViewer can render it; a future
  // pass will explode it into per-article diffs (see follow-up issue).
  const lines = text.split('\n');
  const left: { t: 'eq' | 'add' | 'del'; s: string }[] = [];
  const right: { t: 'eq' | 'add' | 'del'; s: string }[] = [];
  for (const raw of lines) {
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('@@') || raw.startsWith('diff ')) continue;
    if (raw.startsWith('+')) {
      right.push({ t: 'add', s: raw.slice(1) });
    } else if (raw.startsWith('-')) {
      left.push({ t: 'del', s: raw.slice(1) });
    } else {
      const s = raw.startsWith(' ') ? raw.slice(1) : raw;
      left.push({ t: 'eq', s });
      right.push({ t: 'eq', s });
    }
  }
  return {
    num: 'todo',
    titulo: 'Diff completo',
    left: { tag: '', date: '', lines: left },
    right: { tag: '', date: '', lines: right },
    totals: {
      added: right.filter((l) => l.t === 'add').length,
      removed: left.filter((l) => l.t === 'del').length,
    },
  };
}

function transformDiff(raw: BackendLawDiff): DiffResult {
  const article = parseUnifiedDiffLines(raw.diff_text);
  return {
    lawId: raw.law_id,
    from: buildVersionStub(raw.from_commit, raw.from_date),
    to: buildVersionStub(raw.to_commit, raw.to_date),
    articles: [article],
    totals: {
      added: raw.stats.additions,
      removed: raw.stats.deletions,
      modified: raw.stats.changed_articles.length,
    },
  };
}

// ─── Param mapping for laws.list ─────────────────────────────────────────

function listLawsQuery(params: ListLawsParams): Record<string, unknown> {
  // The backend list endpoint currently accepts single-value filters
  // (rank, status, scope, jurisdiction) plus pagination. Multi-select on the
  // frontend collapses to the first value until the backend supports IN-lists.
  return {
    page: params.cursor ? Number(params.cursor) : 1,
    page_size: params.limit ?? 20,
    rank: params.rango?.[0]
      ? Object.entries(RANK_MAP).find(([, v]) => v === params.rango?.[0])?.[0]
      : undefined,
    status: params.status?.[0]
      ? Object.entries(STATUS_MAP).find(([, v]) => v === params.status?.[0])?.[0]
      : undefined,
    scope: params.ambito?.[0]
      ? Object.entries(SCOPE_MAP).find(([, v]) => v === params.ambito?.[0])?.[0]
      : undefined,
  };
}

// ─── Live HTTP implementation ────────────────────────────────────────────

interface BackendPaginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

const liveApi: ApiClient = {
  laws: {
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
      // Backend has no dedicated /references endpoint yet — derive from the
      // law detail. Returns the law's articles that carry outgoing refs.
      const raw = await http<BackendLawDetail>(`/laws/${encodeURIComponent(id)}`);
      return raw.articles.filter((a) => a.references.length > 0).map((a) => transformArticle(id, a));
    },
  },
  articles: {
    get: async (lawId, num) => {
      const raw = await http<{ law_id: string; law_title: string; article: BackendArticle }>(
        `/laws/${encodeURIComponent(lawId)}/articles/${encodeURIComponent(num)}`,
      );
      return transformArticle(raw.law_id, raw.article);
    },
  },
  tags: {
    // #145 — `GET /api/v1/tags` returns `[{tag, count}]` ranked by usage.
    // Empty until the corpus frontmatter carries tags/categories/keywords;
    // the endpoint + shape are live so the Explorer filter and command
    // palette work the moment any law is tagged.
    list: async () => http<Array<{ tag: string; count: number }>>('/tags'),
  },
  graph: {
    forLaw: async (id, depth = 2) => {
      const raw = await http<{
        nodes: {
          id: string;
          title: string | null;
          rank: string | null;
          status: string | null;
          // #143 — per-node cluster id + PageRank, computed over the
          // returned subgraph. Used by the canvas for cluster colour +
          // node size. May be null on an empty/degenerate subgraph.
          community: number | null;
          pagerank: number | null;
        }[];
        edges: { source: string; target: string; source_article: string | null }[];
      }>(`/graph/subgraph/${encodeURIComponent(id)}?depth=${depth}`);
      const nodes: GraphData['nodes'] = raw.nodes.map((n) => ({
        id: n.id,
        kind: n.status === 'repealed' ? 'repealed' : 'law',
        label: n.title ?? n.id,
        dim: n.status === 'repealed',
        meta: {
          rank: n.rank ?? '',
          status: n.status ?? '',
          community: n.community ?? 0,
          pagerank: n.pagerank ?? 0,
        },
      }));
      const edges: GraphData['edges'] = raw.edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        kind: 'cites',
      }));
      return { nodes, edges };
    },
    neighbors: async (id) => {
      // Backend returns `{law_id, neighbors, count}`; consumers only need
      // the list — count is recoverable as `.length` and the law_id is
      // already known to the caller.
      const raw = await http<{ law_id: string; neighbors: string[]; count: number }>(
        `/graph/neighbors/${encodeURIComponent(id)}`,
      );
      return raw.neighbors;
    },
    path: async (from, to) => {
      // 404 (NetworkXNoPath / NodeNotFound) bubbles up as ApiError — the
      // caller can branch on `.status === 404` to render an empty state.
      return await http<string[]>(`/graph/path${qs({ from, to })}`);
    },
    top: async (opts = {}) => {
      const limit = opts.limit ?? 10;
      const metric: GraphTopMetric = opts.metric ?? 'pagerank';
      const raw = await http<{ law_id: string; score: number; title: string | null }[]>(
        `/graph/top${qs({ limit, metric })}`,
      );
      return raw.map<GraphTopItem>((it) => ({
        lawId: it.law_id,
        score: it.score,
        title: it.title,
      }));
    },
    stats: async () => {
      const raw = await http<{
        node_count: number;
        edge_count: number;
        density: number;
        weakly_connected_components: number;
      }>('/graph/stats');
      return {
        nodeCount: raw.node_count,
        edgeCount: raw.edge_count,
        density: raw.density,
        weaklyConnectedComponents: raw.weakly_connected_components,
      };
    },
  },
  search: {
    universal: async (q) => {
      const raw = await http<{
        query: string;
        total: number;
        items: {
          law_id: string;
          law_title: string;
          article_number: string | null;
          snippet: string;
          match_start: number | null;
          match_end: number | null;
          score: number;
        }[];
        page: number;
        page_size: number;
        // #102 — canonical route is /laws/search (search OVER laws).
        // /search still works as a deprecated alias but we target the
        // nested path to drop off the deprecation curve cleanly.
      }>(`/laws/search${qs({ q })}`);
      const hits: SearchResults['hits'] = raw.items.map((h) => ({
        kind: h.article_number ? 'article' : 'law',
        id: h.article_number ? `${h.law_id}::${h.article_number}` : h.law_id,
        title: h.law_title,
        snippet: h.snippet,
        articleNumber: h.article_number ?? undefined,
        match:
          h.match_start !== null && h.match_end !== null
            ? { start: h.match_start, end: h.match_end }
            : null,
        payload: { lawId: h.law_id, articleNum: h.article_number ?? undefined },
      }));
      return { hits, total: raw.total };
    },
  },
  // Chat / dashboards / sync backends are tracked as separate follow-up
  // issues (#83-#86). When `USE_MOCK=true` (default), the SPA uses the
  // in-process `mockApi` for the whole surface so the app is exercisable
  // end-to-end. With `VITE_USE_MOCK=false`, the routes below throw 501
  // until their backend lands — switch back to mock to keep working in
  // the meantime.
  chat: {
    threads: () => Promise.reject(new ApiError(501, null, 'chat.threads not implemented (issue #83)')),
    thread: () => Promise.reject(new ApiError(501, null, 'chat.thread not implemented (issue #83)')),
    async *send() {
      throw new ApiError(501, null, 'chat.send not implemented (issue #84)');
    },
  },
  models: {
    list: async () => {
      // #82 — `GET /api/v1/models` returns a flat list of (provider, model)
      // pairs. Unconfigured providers show up as a placeholder with
      // `configured=false` so the Settings page can render them with a
      // setup hint instead of hiding them.
      const raw = await http<
        {
          id: string;
          provider: string;
          model: string;
          local: boolean;
          configured: boolean;
          context_window: number | null;
          error: string | null;
        }[]
      >('/models');
      return raw.map<Model>((m) => ({
        id: m.id,
        // Placeholder rows have no model name — fall back to the provider key
        // so the Settings list still renders something legible.
        label: m.model || m.provider,
        vendor: m.provider,
        kind: m.local ? 'local' : 'cloud',
        available: m.configured,
      }));
    },
  },
  dashboards: {
    metrics: async (preset) => {
      // #85 — `GET /api/v1/dashboards/{preset}` returns
      // `{ preset, cards: MetricCard[], series: { labels, values, recent_from? } }`.
      // The wire is snake_case; we flip `recent_from` → `recentFrom` here.
      const raw = await http<{
        preset: 'compliance' | 'analytics';
        cards: { id: string; title: string; value: string; delta: string; spark: number[]; positive: boolean | null }[];
        series: { labels: string[]; values: number[]; recent_from: number | null };
      }>(`/dashboards/${encodeURIComponent(preset)}`);
      return {
        preset: raw.preset,
        cards: raw.cards.map((c) => ({
          id: c.id,
          title: c.title,
          value: c.value,
          delta: c.delta,
          spark: c.spark,
          positive: c.positive ?? undefined,
        })),
        series: {
          labels: raw.series.labels,
          values: raw.series.values,
          recentFrom: raw.series.recent_from ?? undefined,
        },
      };
    },
  },
  sync: {
    // #86 — `GET /api/v1/sync/status` returns `{ last_sync_at, upstream,
    // behind, busy }`. The frontend's `SyncStatus` uses `lastSyncAt`,
    // `upstream`, `behind`, `busy` — we flip the only snake_case field.
    status: async () => {
      const raw = await http<{
        last_sync_at: string | null;
        upstream: string;
        behind: number;
        busy: boolean;
      }>('/sync/status');
      return {
        lastSyncAt: raw.last_sync_at,
        upstream: raw.upstream,
        behind: raw.behind,
        busy: raw.busy,
      };
    },
    // 202 from the server: the pull ran (or was skipped because another
    // one was in flight). 409 maps to ApiError(.status=409) so the SPA
    // can show a "sync already running" toast.
    run: async () => {
      await http<unknown>('/sync/run', { method: 'POST' });
    },
  },
  system: {
    warmup: async () => {
      // #222 — backend keys are snake_case per the wire convention; the
      // SPA-facing shape uses camelCase.
      const raw = await http<{
        ready: boolean;
        metadata_ready: boolean;
        search_ready: boolean;
        graph_ready: boolean;
        error: string | null;
        durations_seconds: Record<string, number>;
      }>('/system/warmup');
      return {
        ready: raw.ready,
        metadataReady: raw.metadata_ready,
        searchReady: raw.search_ready,
        graphReady: raw.graph_ready,
        error: raw.error,
        durationsSeconds: raw.durations_seconds,
      };
    },
    whatsNew: async (since: string | null) => {
      // #228 — corpus diff since the last recorded commit. `since` is
      // stored in localStorage by the SPA; null on first launch.
      const url = since ? `/system/whats-new?since=${encodeURIComponent(since)}` : '/system/whats-new';
      const raw = await http<{
        corpus: {
          from_commit: string | null;
          to_commit: string | null;
          added: Array<{ law_id: string; title: string | null }>;
          modified: Array<{ law_id: string; title: string | null }>;
          removed: string[];
        };
      }>(url);
      return {
        fromCommit: raw.corpus.from_commit,
        toCommit: raw.corpus.to_commit,
        added: raw.corpus.added.map((l) => ({ lawId: l.law_id, title: l.title })),
        modified: raw.corpus.modified.map((l) => ({ lawId: l.law_id, title: l.title })),
        removed: raw.corpus.removed,
      };
    },
  },
};

// Silence unused-import warnings for types only referenced via the interface.
void (null as unknown as ChatChunk | ChatMessage | ChatThread | Model | SyncStatus | DashboardData);

// ─── Exported singleton ─────────────────────────────────────────────────

export const api: ApiClient = USE_MOCK ? mockApi : liveApi;

// Re-export for tests / Storybook to compose either client explicitly.
export { liveApi, mockApi };
