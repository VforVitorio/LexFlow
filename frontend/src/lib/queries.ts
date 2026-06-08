/**
 * TanStack Query hooks — one per resource. All data fetching in the app goes
 * through these so the swap between mock + live API in `api.ts` is invisible
 * to the rest of the codebase.
 *
 * Query key convention: ['<domain>', '<op>', ...args].
 * Stable across renames thanks to the `qk` factory below.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';
import { liveTelemetryApi, type TelemetryStatus } from './api/telemetry';
import type {
  Law, LawDetail, Article, LawVersion, DiffResult, GraphData, ChatThread,
  ChatMessage, Model, SyncStatus, DashboardData, ListLawsParams,
  SearchResults, SemanticSearchResults, SystemProfile, WarmupStatus, WhatsNewStatus, HealthSnapshot, SemanticStatus,
  GraphGlobalFilters, GraphGlobalResult,
} from './types';

export const qk = {
  laws: {
    list:       (p?: ListLawsParams) => ['laws', 'list', p ?? {}] as const,
    detail:     (id: string) => ['laws', 'detail', id] as const,
    versions:   (id: string) => ['laws', 'versions', id] as const,
    diff:       (id: string, f: string, t: string) => ['laws', 'diff', id, f, t] as const,
    references: (id: string) => ['laws', 'refs', id] as const,
  },
  articles:    (lawId: string, num: string) => ['articles', lawId, num] as const,
  tags:        () => ['tags'] as const,
  graph:       (id: string, depth?: number) => ['graph', id, depth ?? 2] as const,
  search:      (q: string) => ['search', q] as const,
  chatThreads: () => ['chat', 'threads'] as const,
  chatThread:  (id: string) => ['chat', 'thread', id] as const,
  models:      () => ['models'] as const,
  dashboard:   (preset: 'compliance' | 'analytics') => ['dashboard', preset] as const,
  sync:        () => ['sync'] as const,
};

// ─── Laws ────────────────────────────────────────────────────────────────

export function useLawsList(params: ListLawsParams = {}, options?: Partial<UseQueryOptions<Awaited<ReturnType<typeof api.laws.list>>>>) {
  return useQuery({
    queryKey: qk.laws.list(params),
    queryFn: () => api.laws.list(params),
    staleTime: 30_000,
    ...options,
  });
}

export function useLaw(id: string | undefined) {
  return useQuery<LawDetail>({
    queryKey: qk.laws.detail(id || ''),
    queryFn: () => api.laws.get(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useVersions(id: string | undefined) {
  return useQuery<LawVersion[]>({
    queryKey: qk.laws.versions(id || ''),
    queryFn: () => api.laws.versions(id!),
    enabled: !!id,
  });
}

export function useDiff(id: string | undefined, fromTag: string, toTag: string) {
  return useQuery<DiffResult>({
    queryKey: qk.laws.diff(id || '', fromTag, toTag),
    queryFn: () => api.laws.diff(id!, fromTag, toTag),
    enabled: !!id && !!fromTag && !!toTag,
  });
}

export function useArticle(lawId: string | undefined, num: string | undefined) {
  return useQuery<Article>({
    queryKey: qk.articles(lawId || '', num || ''),
    queryFn: () => api.articles.get(lawId!, num!),
    enabled: !!lawId && !!num,
  });
}

// ─── Tags ────────────────────────────────────────────────────────────────

export function useTags() {
  return useQuery<Array<{ tag: string; count: number }>>({
    queryKey: qk.tags(),
    queryFn: () => api.tags.list(),
    staleTime: 5 * 60_000,
  });
}

// ─── Graph ───────────────────────────────────────────────────────────────

export function useGraph(id: string | undefined, depth = 2) {
  return useQuery<GraphData>({
    queryKey: qk.graph(id || '', depth),
    queryFn: () => api.graph.forLaw(id!, depth),
    enabled: !!id,
  });
}

/**
 * Top-N laws by graph metric (PageRank by default). Powers the GraphPage
 * dynamic seed (#221): instead of hardcoding "CE-1978" — which 404s
 * because the real ID is "BOE-A-1978-31229" — pick the most-connected
 * law in the current corpus. Always returns *something* sensible even
 * as the corpus evolves.
 *
 * Cached aggressively (10 min) because the answer rarely changes between
 * a sync and the next.
 */
export function useGraphTop(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 10;
  return useQuery({
    queryKey: ['graph', 'top', limit] as const,
    queryFn: () => api.graph.top({ limit }),
    staleTime: 10 * 60_000,
  });
}

/**
 * Global graph view — `GET /api/v1/graph` with optional metadata filters.
 *
 * Cache key includes the filter bag so two different filter sets coexist
 * in the query cache (typical UX: user toggles filters, expects the
 * unfiltered view to still be there if they reset).
 */
export function useGlobalGraph(filters: GraphGlobalFilters = {}) {
  return useQuery<GraphGlobalResult>({
    queryKey: ['graph', 'global', filters] as const,
    queryFn: () => api.graph.global(filters),
    staleTime: 5 * 60_000,
  });
}

// ─── Search ──────────────────────────────────────────────────────────────

export function useSearch(q: string) {
  // Backend `/api/v1/search` requires `q` of length ≥ 2 (`min_length=2`).
  // Disparar la query con un solo carácter devuelve 422 y mete ruido en
  // los logs — gateamos aquí para mantener el contrato alineado.
  const trimmed = q.trim();
  return useQuery<SearchResults>({
    queryKey: qk.search(trimmed),
    queryFn: () => api.search.universal(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });
}

/**
 * Audit #477 — semantic search hook. Same min-length gate as the
 * full-text variant so the SPA never fires a 422 on single-char
 * queries. The query key includes `limit` so two different limits
 * coexist in the cache.
 */
export function useSemanticSearch(q: string, limit = 10) {
  const trimmed = q.trim();
  return useQuery<SemanticSearchResults>({
    queryKey: ['search', 'semantic', trimmed, limit] as const,
    queryFn: () => api.search.semantic(trimmed, { limit }),
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });
}

// ─── Chat ────────────────────────────────────────────────────────────────

export function useChatThreads() {
  return useQuery<ChatThread[]>({ queryKey: qk.chatThreads(), queryFn: () => api.chat.threads() });
}

export function useChatThread(id: string | undefined) {
  return useQuery<ChatMessage[]>({
    queryKey: qk.chatThread(id || ''),
    queryFn: () => api.chat.thread(id!),
    enabled: !!id,
  });
}

/**
 * Audit #463 — chat thread mutations.
 *
 * Each mutation invalidates the threads list so the conversation rail
 * refreshes immediately. ``remove`` also drops the per-thread cache
 * for the deleted id so a re-mount doesn't show stale messages.
 */
export function useCreateChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { title?: string; model?: string } = {}) => api.chat.create(opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.chatThreads() }),
  });
}

export function useRenameChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      api.chat.rename(threadId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.chatThreads() }),
  });
}

export function useDeleteChatThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.chat.remove(threadId),
    onSuccess: (_data, threadId) => {
      qc.removeQueries({ queryKey: qk.chatThread(threadId) });
      void qc.invalidateQueries({ queryKey: qk.chatThreads() });
    },
  });
}

// ─── Models / sync / dashboards ─────────────────────────────────────────

export function useModels() {
  return useQuery<Model[]>({ queryKey: qk.models(), queryFn: () => api.models.list(), staleTime: 5 * 60_000 });
}

export function useSyncStatus() {
  return useQuery<SyncStatus>({ queryKey: qk.sync(), queryFn: () => api.sync.status(), refetchInterval: 60_000 });
}

export function useRunSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.sync.run(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sync() }),
  });
}

export function useDashboard(preset: 'compliance' | 'analytics') {
  return useQuery<DashboardData>({ queryKey: qk.dashboard(preset), queryFn: () => api.dashboards.metrics(preset) });
}

// ─── System ──────────────────────────────────────────────────────────────

/**
 * Poll the background warm-up status (#222) until everything is ready.
 *
 * Polls every 2 s while not ready; stops polling once `ready === true`.
 * Consumers read individual flags (`graphReady`, `searchReady`,
 * `metadataReady`) to render specific loading hints instead of a
 * generic spinner.
 *
 * Stale-time is short (1 s) so the moment warm-up finishes the polling
 * stops on the next tick.
 */
export function useWarmup() {
  return useQuery<WarmupStatus>({
    queryKey: ['system', 'warmup'] as const,
    queryFn: () => api.system.warmup(),
    refetchInterval: (q) => (q.state.data?.ready ? false : 2000),
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });
}

/**
 * Fetch what changed in the corpus since *since* commit (#228).
 * Used by the WhatsNewPanel inside SplashGate. Single fetch, no polling.
 * Result is stale immediately so a re-mount always refetches.
 */
export function useWhatsNew(since: string | null) {
  return useQuery<WhatsNewStatus>({
    queryKey: ['system', 'whats-new', since ?? ''] as const,
    queryFn: () => api.system.whatsNew(since),
    staleTime: 0,
  });
}

/**
 * Extended health snapshot (#330). Powers Settings → Diagnostics.
 *
 * Auto-refreshes every 30 s while the panel is open — short enough to
 * catch a disk filling up or the chat DB falling over, long enough not
 * to thrash the backend with probe work.
 */
export function useHealth() {
  return useQuery<HealthSnapshot>({
    queryKey: ['system', 'health'] as const,
    queryFn: () => api.system.health(),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

/**
 * Semantic-search backend availability (#43). Powers the Settings →
 * Models "semantic search" card.
 *
 * Rarely changes within a session (only when the operator installs the
 * extra + restarts), so it's cached long and never polled.
 */
export function useSemanticStatus() {
  return useQuery<SemanticStatus>({
    queryKey: ['system', 'semantic-status'] as const,
    queryFn: () => api.system.semanticStatus(),
    staleTime: Infinity,
  });
}

/**
 * Backend telemetry opt-in gate (#331 SPA surface).
 *
 * Read on Settings → Privacidad open. The user-side gate lives in the
 * Zustand store (``telemetryConsent``); events only flow when both
 * the backend and the user have opted in.
 */
export function useTelemetryStatus() {
  return useQuery<TelemetryStatus>({
    queryKey: ['telemetry', 'status'] as const,
    queryFn: () => liveTelemetryApi.status(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Hardware + local-provider snapshot for the model wizard (#117).
 *
 * Fetched once when the wizard mounts and cached forever — the wizard
 * surfaces a "Re-run detection" button that calls `refetch()` if the
 * user starts Ollama after first launch. We never poll this on a timer.
 */
export function useSystemProfile() {
  return useQuery<SystemProfile>({
    queryKey: ['system', 'profile'] as const,
    queryFn: () => api.system.profile(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// ─── Re-exports for convenience ─────────────────────────────────────────

export type { Law, LawDetail, Article, LawVersion, DiffResult, GraphData, ChatThread, ChatMessage };
