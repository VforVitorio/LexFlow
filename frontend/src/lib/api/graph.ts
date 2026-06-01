/**
 * `liveApi.graph` — subgraph / neighbors / path / top / stats.
 *
 * Subgraph nodes carry per-node `community` + `pagerank` (#143)
 * computed over the returned subgraph; the canvas uses them for
 * cluster colour + node size. Edges currently surface as `cites`
 * — typed edges (modifies / repeals / develops) wait on #144.
 */

import type {
  BackendGraphStats,
  BackendGraphSubgraph,
  BackendGraphTopItem,
} from '../../api';
import type { ApiClient, GraphData, GraphTopItem } from '../types';
import { http, qs } from './http';

export const liveGraphApi: ApiClient['graph'] = {
  forLaw: async (id, depth = 2) => {
    const raw = await http<BackendGraphSubgraph>(
      `/graph/subgraph/${encodeURIComponent(id)}?depth=${depth}`,
    );
    const nodes: GraphData['nodes'] = raw.nodes.map((n) => ({
      id: n.id,
      kind: (n.status ?? '') === 'repealed' ? 'repealed' : 'law',
      label: n.title ?? n.id,
      dim: (n.status ?? '') === 'repealed',
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
    // Backend returns `{law_id, neighbors, count}`; consumers only need the
    // list — count is recoverable as `.length` and the law_id is already
    // known to the caller.
    const raw = await http<{ law_id: string; neighbors: string[]; count: number }>(
      `/graph/neighbors/${encodeURIComponent(id)}`,
    );
    return raw.neighbors;
  },
  path: async (from, to) => {
    // 404 (NetworkXNoPath / NodeNotFound) bubbles up as ApiError — the caller
    // can branch on `.status === 404` to render an empty state. Sprint 6
    // api-6 wrapped the response in `{path: [...]}` so it has room to
    // grow metadata; we still hand callers the flat array.
    const raw = await http<{ path: string[] }>(`/graph/path${qs({ from, to })}`);
    return raw.path;
  },
  top: async (opts = {}) => {
    const limit = opts.limit ?? 10;
    // Sprint 6 api-7 dropped the dead `metric=` query param. The SPA
    // type kept `metric?: GraphTopMetric` for forward-compat with future
    // ranking algorithms; we just don't forward it on the wire today.
    const raw = await http<{ items: BackendGraphTopItem[] }>(`/graph/top${qs({ limit })}`);
    return raw.items.map<GraphTopItem>((it) => ({
      lawId: it.law_id,
      score: it.score,
      title: it.title ?? null,
    }));
  },
  stats: async () => {
    const raw = await http<BackendGraphStats>('/graph/stats');
    return {
      nodeCount: raw.node_count,
      edgeCount: raw.edge_count,
      density: raw.density,
      weaklyConnectedComponents: raw.weakly_connected_components,
    };
  },
};
