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
import type {
  Law, LawDetail, Article, LawVersion, DiffResult, GraphData, ChatThread,
  ChatMessage, Model, SyncStatus, DashboardData, ListLawsParams,
  SearchResults,
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

// ─── Re-exports for convenience ─────────────────────────────────────────

export type { Law, LawDetail, Article, LawVersion, DiffResult, GraphData, ChatThread, ChatMessage };
