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
    // The backend does not surface a tag vocabulary yet (it lives only in
    // mock-data). Returning an empty list is correct under the live client
    // until the tag endpoint lands (tracked as a follow-up issue).
    list: async () => [],
  },
  graph: {
    forLaw: async (id, depth = 2) => {
      const raw = await http<{
        nodes: { id: string; title: string | null; rank: string | null; status: string | null }[];
        edges: { source: string; target: string; source_article: string | null }[];
      }>(`/graph/subgraph/${encodeURIComponent(id)}?depth=${depth}`);
      const nodes: GraphData['nodes'] = raw.nodes.map((n) => ({
        id: n.id,
        kind: n.status === 'repealed' ? 'repealed' : 'law',
        label: n.title ?? n.id,
        dim: n.status === 'repealed',
        meta: { rank: n.rank ?? '', status: n.status ?? '' },
      }));
      const edges: GraphData['edges'] = raw.edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        kind: 'cites',
      }));
      return { nodes, edges };
    },
  },
  search: {
    universal: async (q) => {
      const raw = await http<{
        query: string;
        total: number;
        items: { law_id: string; law_title: string; article_number: string | null; snippet: string; score: number }[];
        page: number;
        page_size: number;
      }>(`/search${qs({ q })}`);
      const hits: SearchResults['hits'] = raw.items.map((h) => ({
        kind: h.article_number ? 'article' : 'law',
        id: h.article_number ? `${h.law_id}::${h.article_number}` : h.law_id,
        title: h.law_title,
        subtitle: h.article_number ? `Art. ${h.article_number} — ${h.snippet}` : h.snippet,
        payload: { lawId: h.law_id, articleNum: h.article_number ?? undefined },
      }));
      return { hits, total: raw.total };
    },
  },
  // Chat / models / dashboards / sync are tracked as separate follow-up issues
  // (#82-#86). Until they land, the mock implementation is used for these
  // surfaces — flip VITE_USE_MOCK=true to exercise them.
  chat: {
    threads: () => Promise.reject(new ApiError(501, null, 'chat.threads not implemented (issue #83)')),
    thread: () => Promise.reject(new ApiError(501, null, 'chat.thread not implemented (issue #83)')),
    async *send() {
      throw new ApiError(501, null, 'chat.send not implemented (issue #84)');
    },
  },
  models: {
    list: () => Promise.reject(new ApiError(501, null, 'models.list not implemented (issue #82)')),
  },
  dashboards: {
    metrics: () => Promise.reject(new ApiError(501, null, 'dashboards.metrics not implemented (issue #85)')),
  },
  sync: {
    status: () => Promise.reject(new ApiError(501, null, 'sync.status not implemented (issue #86)')),
    run: () => Promise.reject(new ApiError(501, null, 'sync.run not implemented (issue #86)')),
  },
};

// Silence unused-import warnings for types only referenced via the interface.
void (null as unknown as ChatChunk | ChatMessage | ChatThread | Model | SyncStatus | DashboardData);

// ─── Exported singleton ─────────────────────────────────────────────────

export const api: ApiClient = USE_MOCK ? mockApi : liveApi;

// Re-export for tests / Storybook to compose either client explicitly.
export { liveApi, mockApi };
