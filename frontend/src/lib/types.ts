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
  | 'Real Decreto'
  | 'RD Legislativo'
  | 'Reglamento UE'
  | 'Decisión'
  | 'Otro';

export type Ambito = 'Estatal' | 'UE' | 'Autonómica' | 'Local';

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

export type SearchHitKind = 'law' | 'article' | 'thread' | 'dashboard' | 'command';

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Optional opaque payload used by the consumer to navigate. */
  payload?: Record<string, unknown>;
}
export interface SearchResults {
  hits: SearchHit[];
  total: number;
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
  yearFrom?: number;
  yearTo?: number;
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
    references(id: string): Promise<Article[]>;
  };
  articles: {
    get(lawId: string, num: string): Promise<Article>;
  };
  /** Tag vocabulary across the corpus, with usage counts. */
  tags: {
    list(): Promise<Array<{ tag: string; count: number }>>;
  };
  graph: {
    forLaw(id: string, depth?: number): Promise<GraphData>;
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
    universal(q: string): Promise<SearchResults>;
  };
  chat: {
    threads(): Promise<ChatThread[]>;
    thread(id: string): Promise<ChatMessage[]>;
    /** Streams chunks until `{type:'done'}`. Implementations may emit text deltas, tool calls, tool results, and sources. */
    send(
      threadId: string,
      content: string,
      opts?: { model?: string }
    ): AsyncIterable<ChatChunk>;
  };
  models: {
    list(): Promise<Model[]>;
  };
  dashboards: {
    metrics(preset: 'compliance' | 'analytics'): Promise<DashboardData>;
  };
  sync: {
    status(): Promise<SyncStatus>;
    run(): Promise<void>;
  };
}
