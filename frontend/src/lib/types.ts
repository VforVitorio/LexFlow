/**
 * LexFlow — domain types.
 *
 * These shapes mirror what the FastAPI backend is expected to return.
 * If the backend uses different field names, do the rename in `src/lib/api.ts`
 * (e.g. snake_case → camelCase) rather than touching the rest of the app.
 */

// ─── Laws ────────────────────────────────────────────────────────────────

export type LawStatus = 'vigente' | 'modificada' | 'derogada' | 'pendiente';

export type RangoNormativo =
  | 'Norma constitucional'
  | 'Ley Orgánica'
  | 'Ley'
  | 'Ley Foral'
  | 'Real Decreto'
  | 'RD Legislativo'
  | 'Decreto'
  | 'Decreto-ley'
  | 'Decreto-ley Foral'
  | 'Decreto Foral Legislativo'
  | 'Orden'
  | 'Resolución'
  | 'Circular'
  | 'Instrucción'
  | 'Acuerdo'
  | 'Acuerdo Internacional'
  | 'Reglamento'
  | 'Reglamento UE'
  | 'Decisión'
  | 'Otro';

export type Ambito = 'Estatal' | 'UE' | 'Autonómica' | 'Local';

/**
 * Jurisdiction code as expected by the backend `jurisdiction` query param.
 * `'es'` is the national (estatal) scope; the rest are NUTS-1 region codes.
 */
export type JurisdictionCode =
  | 'es'
  | 'es-an'
  | 'es-ar'
  | 'es-as'
  | 'es-cb'
  | 'es-cl'
  | 'es-cm'
  | 'es-cn'
  | 'es-ct'
  | 'es-ex'
  | 'es-ga'
  | 'es-ib'
  | 'es-mc'
  | 'es-md'
  | 'es-nc'
  | 'es-pv'
  | 'es-ri'
  | 'es-vc';

/**
 * Display name for each jurisdiction code. Ordered as they appear in the UI
 * (national first, then alphabetical by display name).
 */
export const COMMUNITIES: ReadonlyArray<{ code: JurisdictionCode; name: string }> = [
  { code: 'es',    name: 'Estatal' },
  { code: 'es-an', name: 'Andalucía' },
  { code: 'es-ar', name: 'Aragón' },
  { code: 'es-as', name: 'Asturias' },
  { code: 'es-cb', name: 'Cantabria' },
  { code: 'es-cl', name: 'Castilla y León' },
  { code: 'es-cm', name: 'Castilla-La Mancha' },
  { code: 'es-cn', name: 'Canarias' },
  { code: 'es-ct', name: 'Cataluña' },
  { code: 'es-ex', name: 'Extremadura' },
  { code: 'es-ga', name: 'Galicia' },
  { code: 'es-ib', name: 'Islas Baleares' },
  { code: 'es-mc', name: 'Región de Murcia' },
  { code: 'es-md', name: 'Madrid' },
  { code: 'es-nc', name: 'Navarra' },
  { code: 'es-pv', name: 'País Vasco' },
  { code: 'es-ri', name: 'La Rioja' },
  { code: 'es-vc', name: 'Comunidad Valenciana' },
] as const;

export interface Law {
  /** Internal stable id (e.g. "CE-1978", "LO-3-2018"). Used in URLs. */
  id: string;
  /** Official BOE identifier (e.g. "BOE-A-2018-16673"). */
  boe: string;
  /** Full official title. */
  title: string;
  /** Short alias used in UI lists ("LOPDGDD"). */
  short: string;
  status: LawStatus;
  rango: RangoNormativo;
  /** ISO date string (publicada). */
  publicada: string;
  ambito: Ambito;
  /** Counts — surface stats for the explorer / detail header. */
  articulos: number;
  referencias: number;
  versiones: number;
  /** ISO date string of the most recent consolidation, if any. */
  ultimaModificacion?: string;
  /**
   * Topic tags (Obsidian-style). Used to drive `#tag` search and the tags
   * filter on the Explorer. Stored without the leading `#`. Lowercase, kebab.
   */
  tags?: string[];
}

export interface LawDetail extends Law {
  /** Top-level hierarchy. Each node may recurse. */
  hierarchy: HierarchyNode[];
  /**
   * Full article payload returned by `GET /api/v1/laws/{id}`. The backend
   * already ships this; the SPA used to discard it and re-fetch the law
   * detail again from a now-removed shim. Consumers that just need a few
   * articles can read this directly instead of issuing an extra request.
   */
  articles: Article[];
}

export interface HierarchyNode {
  id: string;
  kind: 'titulo' | 'libro' | 'capitulo' | 'seccion' | 'articulo' | 'disposicion';
  /** Human label, e.g. "TÍTULO I", "Art. 18". */
  label: string;
  /** Short heading, e.g. "De los derechos fundamentales y libertades públicas". */
  heading?: string;
  children?: HierarchyNode[];
}

// ─── Articles ────────────────────────────────────────────────────────────

export interface Article {
  /** Composite id: `${lawId}::${num}` */
  id: string;
  lawId: string;
  /** "18", "28.3", etc. */
  num: string;
  titulo: string;
  /** Body split into paragraphs / clauses, in source order. */
  body: ArticleClause[];
  /** Outgoing references (laws or articles this one cites). */
  refs: ArticleRef[];
}

export interface ArticleClause {
  /** "1", "2", "a)", null if the article has no internal numbering. */
  marker: string | null;
  text: string;
  /** Inline citation handles — render as superscripts that open the right rail. */
  citations: ArticleRef[];
}

export interface ArticleRef {
  /** Display label, e.g. "DUDH", "art. 96 CE", "LO 3/2018". */
  label: string;
  /** Optional resolved target — when present, the UI can navigate to it. */
  target?: {
    lawId: string;
    articleNum?: string;
  };
  /** Free-form source kind for filtering. */
  kind?: 'law' | 'article' | 'treaty' | 'doctrine' | 'jurisprudence';
}

// ─── Versions / Diff ─────────────────────────────────────────────────────

export interface LawVersion {
  tag: string;          // "v1.3"
  date: string;         // ISO
  label: string;        // "Ley 11/2023 · disp. final 4ª"
  kind: 'publish' | 'amend' | 'consolidate' | 'repeal';
  /** Article numbers touched by this version. */
  changedArticles?: string[];
}

export interface DiffResult {
  lawId: string;
  from: LawVersion;
  to: LawVersion;
  /** Per-article diffs, in source order. */
  articles: ArticleDiff[];
  /** Totals across the diff. */
  totals: { added: number; removed: number; modified: number };
}

export interface ArticleDiff {
  num: string;
  titulo: string;
  left: DiffSide;
  right: DiffSide;
  /** Aggregate count per article, used in the right-rail summary. */
  totals: { added: number; removed: number };
}
export interface DiffSide {
  tag: string;
  date: string;
  lines: DiffLine[];
}
export interface DiffLine {
  /** `eq` = unchanged, `add` = right-only, `del` = left-only. */
  t: 'eq' | 'add' | 'del';
  s: string;
}

// ─── Graph ───────────────────────────────────────────────────────────────

export type GraphNodeKind = 'law' | 'article' | 'reference' | 'amendment' | 'repealed';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Layout coords from the backend (elkjs); the canvas may animate to these. */
  x?: number;
  y?: number;
  /** UI hint: dim repealed / out-of-scope nodes. */
  dim?: boolean;
  /** Optional metadata surfaced in the right rail. */
  meta?: Record<string, string | number>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Edge kind (cites, modifies, repeals, …). */
  kind?: 'cites' | 'modifies' | 'repeals' | 'develops';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// #81 — auxiliary graph endpoints. Camel-cased mirrors of the backend's
// snake_case schemas (`GraphTopItem`, `GraphStatsResponse`).
export interface GraphTopItem {
  lawId: string;
  score: number;
  title: string | null;
}
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  density: number;
  weaklyConnectedComponents: number;
}

/**
 * Filter set for the global graph endpoint (`GET /api/v1/graph`).
 *
 * Mirrors the backend query params (`status`, `rank`, `scope`,
 * `jurisdiction`, `limit`). Wire strings match the backend enum
 * values (e.g. `'in_force'`, `'real_decreto'`) — the SPA's domain
 * enums (`vigente`, `Real Decreto`) get translated at the call
 * site via the existing maps in `transformers.ts`.
 */
export interface GraphGlobalFilters {
  /** Backend `LawStatus` enum value (e.g. `'in_force'`). */
  status?: string;
  /** Backend `LawRank` enum value (e.g. `'real_decreto'`). */
  rank?: string;
  /** Backend `Scope` enum value (e.g. `'Estatal'`). */
  scope?: string;
  /** Jurisdiction code, e.g. `'es'`, `'es-md'`. */
  jurisdiction?: string;
  /** Top-N by PageRank. Omit for "everything matching"; backend caps at 50k. */
  limit?: number;
}

/**
 * Global-graph payload — same shape as the subgraph response plus
 * `totalAvailable`, the number of nodes that matched the filters
 * BEFORE the limit truncated. Useful for "showing N of M laws".
 */
export interface GraphGlobalResult extends GraphData {
  totalAvailable: number;
}
export type GraphTopMetric = 'pagerank';

// ─── Chat ────────────────────────────────────────────────────────────────

export interface ChatThread {
  id: string;
  title: string;
  /** ISO date — used for the conversation rail grouping. */
  updatedAt: string;
  /** Snippet rendered next to the title on hover (optional). */
  preview?: string;
}

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatMessageBase {
  id: string;
  role: ChatRole;
  /** ISO timestamp. */
  createdAt: string;
}
export interface UserMessage extends ChatMessageBase {
  role: 'user';
  content: string;
}
export interface AssistantMessage extends ChatMessageBase {
  role: 'assistant';
  /** Renderable markdown-ish blocks. */
  content: string[];
  sources: ChatSource[];
  /** Set while the message is streaming in. */
  streaming?: boolean;
}
export interface ToolCallMessage extends ChatMessageBase {
  role: 'tool';
  name: string;
  args: Record<string, unknown>;
  result: string;
  collapsed?: boolean;
}
export type ChatMessage = UserMessage | AssistantMessage | ToolCallMessage;

export interface ChatSource {
  law: string;
  article: string;
  date: string;
  snippet: string;
  /** Optional resolved target — clicking the card navigates here. */
  target?: { lawId: string; articleNum?: string };
}

/** SSE chunk shape — keep it loose so the FastAPI side can extend. */
export type ChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'source'; source: ChatSource }
  | { type: 'done' };

// ─── Models ──────────────────────────────────────────────────────────────

export type ModelKind = 'cloud' | 'local';
export interface Model {
  id: string;
  label: string;
  vendor: string;
  kind: ModelKind;
  /** Whether a credential is configured locally. */
  available: boolean;
}

/**
 * An Ollama model already on disk (#597), from `GET /api/v1/models/installed`.
 * Drives the Settings → Modelos management card (size, loaded badge, actions).
 */
export interface InstalledModel {
  name: string;
  /** On-disk size in bytes, if Ollama reported it. */
  sizeBytes: number | null;
  /** Currently held warm in memory (`ollama ps`). */
  loaded: boolean;
}

/**
 * One event from the `POST /api/v1/models/pull` SSE stream (#119).
 *
 * Discriminated union — switch on `type`:
 *   - `progress`: bytes-and-status update; the wizard renders this as a bar.
 *   - `done`: the model is installed; the wizard re-detects `ollama_models`.
 *   - `error`: the pull failed; the wizard surfaces `code` + `message`.
 */
export type ModelPullEvent =
  | { type: 'progress'; status: string | null; completed: number | null; total: number | null; digest: string | null }
  | { type: 'done'; model: string }
  | { type: 'error'; code: string; message: string };

/**
 * One event from the `POST /api/v1/system/semantic-install` SSE stream (#578).
 *
 * The semantic extra has no byte counters (pip/uv print opaque log lines), so
 * `progress` carries a single human-readable `status` line. Terminates on
 * `done` (extra installed) or `error` (with a `code` the card branches on,
 * e.g. `semantic_install_unavailable` in a frozen build).
 */
export type SemanticInstallEvent =
  | { type: 'progress'; status: string }
  | { type: 'done'; package: string }
  | { type: 'error'; code: string; message: string };

// ─── Sync / status ───────────────────────────────────────────────────────

export interface SyncStatus {
  lastSyncAt: string | null;
  upstream: string;
  /** Pending commits behind upstream (legalize-es). */
  behind: number;
  /** Currently syncing. */
  busy: boolean;
}

// ─── Search ──────────────────────────────────────────────────────────────

/**
 * Facet params accepted by the corpus-wide search endpoint
 * (`GET /api/v1/laws/search`). Mirror of the facets the Explorer
 * already wires to `laws.list` — single-value because the backend
 * accepts one value per filter at a time.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend adds a new filter param → add a field here and wire it in
 * `api/search.ts` `buildSearchQuery` and `listLawsQuery` in `transformers.ts`.
 */
export interface SearchFacets {
  /** Backend `LawRank` enum value (e.g. `'real_decreto'`). */
  rank?: string;
  /** Backend `LawStatus` enum value (e.g. `'in_force'`). */
  status?: string;
  /** Backend `Scope` enum value (e.g. `'Estatal'`). */
  scope?: string;
  /** NUTS-1 jurisdiction code (e.g. `'es-md'`). */
  jurisdiction?: JurisdictionCode;
  /** Inclusive start of publication year range. */
  year_from?: number;
  /** Inclusive end of publication year range. */
  year_to?: number;
  /**
   * Official topic tags to AND-filter by (#671). Serialised as repeated
   * `?tags=a&tags=b`. Unlike the single-value facets above, tags is a set
   * because the Explorer accumulates chip + inline `#tag` selections.
   */
  tags?: string[];
  /**
   * Issuing department (ministerio), exact match (#671 gap B). Single-value
   * like `jurisdiction` — the backend accepts one department at a time.
   */
  department?: string;
  /** Result page (1-based). */
  page?: number;
  /** Hits per page. */
  page_size?: number;
}

export type SearchHitKind = 'law' | 'article' | 'thread' | 'dashboard' | 'command';

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  /**
   * Free-form subtitle. Prefer composing the rendered subtitle from `snippet`
   * + the article prefix at the call site so the match can be highlighted —
   * this field stays as a fallback when no snippet is available.
   */
  subtitle?: string;
  /** Text fragment with match context (rendered with `<HighlightedSnippet>`). */
  snippet?: string;
  /** Article number (when the hit is article-scoped). Rendered as `Art. N — ` prefix. */
  articleNumber?: string;
  /**
   * Character offsets of the query within `snippet` so the UI can wrap the
   * substring in a highlight without re-scanning. Null when the match was
   * outside the trimmed window or the hit was title-only.
   */
  match?: { start: number; end: number } | null;
  /** Optional opaque payload used by the consumer to navigate. */
  payload?: Record<string, unknown>;
}
export interface SearchResults {
  hits: SearchHit[];
  total: number;
}

/**
 * One hit from the semantic search endpoint (#477).
 *
 * Returned by `liveApi.search.semantic(q)`. Always article-scoped: the
 * backend ranks by cosine similarity between the query embedding and
 * each article's embedding, so a "law-only" hit doesn't make sense
 * here. Score is a float in [0, 1]; the SPA renders it as a percent.
 */
export interface SemanticSearchHit {
  lawId: string;
  articleNumber: string;
  snippet: string;
  score: number;
}

export interface SemanticSearchResults {
  hits: SemanticSearchHit[];
  query: string;
}

/**
 * One hit from the hybrid search endpoint (#43).
 *
 * Returned by `liveApi.search.hybrid(q)` — Reciprocal Rank Fusion of the
 * keyword + semantic rankers. `score` is a fused RRF score (relative
 * ranking only, NOT a 0–1 confidence), so the UI shows `sources` (which
 * rankers found it) rather than a percentage bar. `articleNumber` is
 * nullable: a full-text hit can match a law title, not a specific article.
 */
export interface HybridSearchHit {
  lawId: string;
  articleNumber: string | null;
  snippet: string;
  score: number;
  sources: string[];
}

export interface HybridSearchResults {
  hits: HybridSearchHit[];
  query: string;
}

// ─── Dashboards ──────────────────────────────────────────────────────────

export interface MetricCard {
  id: string;
  title: string;
  value: string;
  delta: string;
  /** Sparkline series (latest 12 points). */
  spark: number[];
  /** Whether `delta` represents a positive change. */
  positive?: boolean;
}

export interface DashboardData {
  preset: 'compliance' | 'analytics';
  cards: MetricCard[];
  /** A larger time-series figure to render below the cards. */
  series: {
    labels: string[];
    values: number[];
    /** Index in `labels` from which to highlight as "recent". */
    recentFrom?: number;
  };
}

// ─── User tags ───────────────────────────────────────────────────────────

/**
 * A custom tag a user attached to a law (#670). Distinct from the corpus
 * `tags` vocabulary (`Law.tags`), which is read-only and derived from BOE
 * frontmatter — user tags are freeform labels stored per-user, per-law.
 */
export interface UserTag {
  /** Kebab-case ASCII slug — mirrors the backend's `normalize_tag`. */
  tag: string;
  /** Display label as the user typed it. */
  label: string;
}

/** A user tag with its usage count across laws — powers the tag vocabulary view. */
export interface UserTagCount extends UserTag {
  count: number;
}

// ─── Departments ─────────────────────────────────────────────────────────

/**
 * An issuing department (ministerio) and how many laws it issued (#671 gap B).
 * Read-only, corpus-derived — mirrors `{tag, count}` from `useTags`, but the
 * value is a free-text BOE field, never slugged.
 */
export interface DepartmentCount {
  department: string;
  count: number;
}

// ─── Common ──────────────────────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  cursor?: string | null;
}

export interface ListLawsParams {
  q?: string;
  status?: LawStatus[];
  rango?: RangoNormativo[];
  ambito?: Ambito[];
  /**
   * Tags to AND-filter by. The corpus tag vocabulary is open — see
   * `getAllTags()` in `api.mock` for the seed values and
   * `/api/tags` (TODO on the backend) for the live list.
   */
  tags?: string[];
  /** Publication-year range (inclusive), #563. */
  yearFrom?: number;
  yearTo?: number;
  /**
   * Autonomous community filter. Omit to return all jurisdictions.
   * Maps directly to the backend `jurisdiction` query param
   * (e.g. `'es-md'` → `GET /api/v1/laws?jurisdiction=es-md`).
   * Single-select: the backend accepts one code at a time.
   */
  jurisdiction?: JurisdictionCode;
  /**
   * Issuing department (ministerio) filter (#671 gap B). Omit to return all
   * departments. Maps directly to the backend `department` query param,
   * exact match. Single-select, same shape as `jurisdiction`.
   */
  department?: string;
  sort?: 'relevance' | 'date' | 'refs' | 'title';
  cursor?: string | null;
  limit?: number;
}

// ─── Client interface ────────────────────────────────────────────────────

/**
 * The whole client surface. Both `mockApi` and `liveApi` implement this.
 * Method names are kebabed by domain so consumers can write
 * `api.laws.list(...)`, `api.chat.send(...)`, etc.
 */
export interface ApiClient {
  laws: {
    list(params?: ListLawsParams): Promise<Paginated<Law>>;
    get(id: string): Promise<LawDetail>;
    versions(id: string): Promise<LawVersion[]>;
    diff(id: string, fromTag: string, toTag: string): Promise<DiffResult>;
    /**
     * Outgoing cross-references for the law. Calls the dedicated
     * `GET /api/v1/laws/{id}/references` endpoint (#96) — used to derive
     * from the law detail, which transferred the full law body just to
     * read a few KB of refs.
     */
    references(id: string): Promise<ArticleRef[]>;
  };
  articles: {
    get(lawId: string, num: string): Promise<Article>;
  };
  /** Tag vocabulary across the corpus, with usage counts. */
  tags: {
    list(): Promise<Array<{ tag: string; count: number }>>;
  };
  /** Issuing-department (ministerio) vocabulary across the corpus (#671 gap B). */
  departments: {
    list(): Promise<DepartmentCount[]>;
  };
  /**
   * Custom user tags on laws (#670). Unlike `tags` above (read-only,
   * corpus-derived), this is user-owned CRUD: attach/detach a freeform
   * label on a law, browse the user's tag vocabulary, and find every law
   * carrying a given tag.
   */
  userTags: {
    /** Tags the current user has attached to `lawId`. */
    forLaw(lawId: string): Promise<UserTag[]>;
    /** Attach a new tag (by display label) to `lawId`; returns the created tag. */
    add(lawId: string, label: string): Promise<UserTag>;
    /** Detach `tag` (the slug, not the label) from `lawId`. */
    remove(lawId: string, tag: string): Promise<void>;
    /** The user's full tag vocabulary, with per-tag law counts. */
    vocab(): Promise<UserTagCount[]>;
    /** Every law id carrying `tag`. */
    lawsFor(tag: string): Promise<string[]>;
  };
  graph: {
    forLaw(id: string, depth?: number): Promise<GraphData>;
    /**
     * Global graph (no seed) — Obsidian-style corpus view (#146).
     *
     * Filters narrow the node set BEFORE the limit kicks in. With no
     * filters and no limit the backend returns the full induced graph
     * (capped at 50 k nodes to avoid serialising the universe).
     */
    global(filters?: GraphGlobalFilters): Promise<GraphGlobalResult>;
    /** Direct successors (outgoing references) of a law node. */
    neighbors(id: string): Promise<string[]>;
    /** Shortest directed path between two law nodes (404 if disconnected). */
    path(from: string, to: string): Promise<string[]>;
    /** Top-`limit` laws by PageRank (only metric supported today). */
    top(opts?: { limit?: number; metric?: GraphTopMetric }): Promise<GraphTopItem[]>;
    /** Global graph stats — node/edge count, density, components. */
    stats(): Promise<GraphStats>;
  };
  search: {
    /**
     * Corpus-wide full-text search (#102, #671).
     *
     * `facets` maps directly to the backend's filter params (rank, status,
     * scope, jurisdiction, year_from, year_to). Omit to search without
     * filtering. Pass `page` / `page_size` for pagination; defaults on the
     * backend are page=1, page_size=20.
     */
    universal(q: string, facets?: SearchFacets): Promise<SearchResults>;
    /**
     * Semantic search over the article corpus (#477).
     *
     * Hits the dedicated `/laws/search/semantic` endpoint. Returns
     * article-scoped results ranked by cosine similarity. `limit`
     * caps the number of hits (backend max: 50).
     */
    semantic(q: string, opts?: { limit?: number }): Promise<SemanticSearchResults>;
    /**
     * Hybrid search — Reciprocal Rank Fusion of keyword + semantic (#43).
     *
     * Routes to ``GET /api/v1/laws/search/hybrid``. ``opts.limit`` caps
     * the number of fused hits (backend max: 50).
     */
    hybrid(q: string, opts?: { limit?: number }): Promise<HybridSearchResults>;
  };
  chat: {
    threads(): Promise<ChatThread[]>;
    thread(id: string): Promise<ChatMessage[]>;
    /**
     * Create a new thread (#463). The backend default title is
     * "Nueva conversación"; pass ``title`` to override. ``model`` is
     * optional metadata for the conversation rail.
     */
    create(opts?: { title?: string; model?: string }): Promise<ChatThread>;
    /** Rename a thread; the backend rejects empty/whitespace titles. */
    rename(threadId: string, title: string): Promise<ChatThread>;
    /** Delete a thread + cascade messages. Idempotent: deleting an
     * unknown id still resolves cleanly (the backend returns 204). */
    remove(threadId: string): Promise<void>;
    /** Streams chunks until `{type:'done'}`. Implementations may emit text deltas, tool calls, tool results, and sources. */
    send(
      threadId: string,
      content: string,
      opts?: { model?: string }
    ): AsyncIterable<ChatChunk>;
  };
  models: {
    list(): Promise<Model[]>;
    /** Installed Ollama models with size + loaded state (#597). */
    installed(): Promise<InstalledModel[]>;
    /** Delete an installed Ollama model (``ollama rm``) (#597). */
    remove(model: string): Promise<void>;
    /** Warm a model into memory (``keep: true``) or eject it (``false``) (#597). */
    load(model: string, keep: boolean): Promise<void>;
    /**
     * Install an Ollama model and stream its progress (#119).
     *
     * Yields `progress` chunks while bytes flow, then either a `done`
     * (success) or `error` (failure) terminator. Implementations stop
     * iterating after either terminator. The wizard's confirm step
     * consumes this and renders a real progress bar instead of asking
     * the user to copy/paste `ollama pull <tag>` into a terminal.
     */
    pull(model: string): AsyncIterable<ModelPullEvent>;
  };
  dashboards: {
    metrics(preset: 'compliance' | 'analytics'): Promise<DashboardData>;
  };
  sync: {
    status(): Promise<SyncStatus>;
    run(): Promise<void>;
  };
  /** Process introspection — used by the SPA to time loading UI. */
  system: {
    /** Background warm-up progress (#222). Polled until `ready: true`. */
    warmup(): Promise<WarmupStatus>;
    /** Corpus diff since the last recorded commit (#228). */
    whatsNew(since: string | null): Promise<WhatsNewStatus>;
    /** Hardware + local LLM providers (#117). Consumed by the model wizard. */
    profile(): Promise<SystemProfile>;
    /** Extended health snapshot (#330). Polled by Settings → Diagnostics. */
    health(): Promise<HealthSnapshot>;
    /** Semantic-search backend availability (#43). Settings → Models card. */
    semanticStatus(): Promise<SemanticStatus>;
    /**
     * Install the optional `[semantic]` extra in-app (#578), streaming
     * progress like `models.pull`. The Settings card consumes this so a
     * lawyer never copies a `uv sync` command into a terminal.
     */
    installSemantic(): AsyncIterable<SemanticInstallEvent>;
  };
}

/**
 * Semantic-search backend availability (#43).
 *
 * From ``GET /api/v1/system/semantic-status``. Drives the Settings →
 * Models card: whether the optional ``[semantic]`` extra is installed,
 * which backend is configured, and whether real (model-based) ranking is
 * actually in effect.
 */
export interface SemanticStatus {
  /** Configured backend: `'hash'` (placeholder) or `'sentence-transformers'`. */
  backend: string;
  /** Whether the optional `sentence-transformers` dependency is importable. */
  installed: boolean;
  /** Real semantic ranking in effect (backend selected AND dependency installed). */
  active: boolean;
  /** Configured sentence-transformers model name (used when active). */
  model: string;
}

/**
 * Extended health snapshot (#330).
 *
 * The legacy `/health` is a one-liner for liveness probes; this comes
 * from ``GET /api/v1/system/health`` and carries every probe (memory,
 * disk, corpus, chat DB). ``status`` is ``ok`` when every probe is
 * green, ``degraded`` when at least one is red but the API still serves.
 */
export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  memory: {
    rssMb: number;
    systemUsedPercent: number;
  };
  disk: {
    path: string;
    totalGb: number;
    usedGb: number;
    freeGb: number;
    usedPercent: number;
  };
  corpus: {
    submodulePresent: boolean;
    lawsIndexed: number;
  };
  chatDb: {
    reachable: boolean;
  };
}

/**
 * Hardware + local-provider snapshot (#117).
 *
 * One-shot result used by the model wizard to recommend a tier. Do NOT
 * poll this — re-run detection only when the user explicitly relaunches
 * the wizard from Ajustes → Modelos.
 */
export interface SystemProfile {
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
  hasNvidiaGpu: boolean;
  vramGb: number | null;
  gpuName: string | null;
  isAppleSilicon: boolean;
  platform: 'linux' | 'darwin' | 'windows' | string;
  ollamaRunning: boolean;
  ollamaModels: string[];
  lmstudioRunning: boolean;
}

/** A law that changed between two corpus revisions (#228). */
export interface WhatsNewLaw {
  lawId: string;
  title: string | null;
}

/** Corpus diff summary for the what's-new splash panel (#228). */
export interface WhatsNewStatus {
  fromCommit: string | null;
  toCommit: string | null;
  added: WhatsNewLaw[];
  modified: WhatsNewLaw[];
  removed: string[];
}

/**
 * Snapshot of the post-startup background warm-up sequence (#222).
 * Powers per-page loading hints — `graph_ready === false` lets GraphPage
 * say "Construyendo grafo, ~30s" instead of a blank spinner.
 */
export interface WarmupStatus {
  ready: boolean;
  metadataReady: boolean;
  searchReady: boolean;
  graphReady: boolean;
  error: string | null;
  durationsSeconds: Record<string, number>;
}
