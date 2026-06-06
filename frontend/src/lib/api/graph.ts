/**
 * `liveApi.graph` — subgraph / global / neighbors / path / top / stats.
 *
 * Subgraph nodes carry per-node `community` + `pagerank` (#143)
 * computed over the returned subgraph; the canvas uses them for
 * cluster colour + node size. Edges currently surface as `cites`
 * — typed edges (modifies / repeals / develops) wait on #144.
 */

import type {
  BackendGraphEdge,
  BackendGraphGlobal,
  BackendGraphNode,
  BackendGraphStats,
  BackendGraphSubgraph,
  BackendGraphTopItem,
} from '../../api';
import type { ApiClient, GraphData, GraphGlobalFilters, GraphGlobalResult, GraphTopItem } from '../types';
import { http, qs } from './http';

/**
 * Project a `BackendGraphNode` into the SPA's node shape.
 *
 * Same projection is used by `forLaw` (subgraph) and `global` — sharing
 * it here keeps "what visually represents a law node" in one spot.
 * `kind` collapses to `repealed` when the backend status marks it so;
 * the canvas dims accordingly.
 */
function projectNode(n: BackendGraphNode): GraphData['nodes'][number] {
  return {
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
  };
}

/**
 * Project a `BackendGraphEdge` with the SPA's `e-<i>` id convention.
 * `kind` is hard-coded to `'cites'` until #144 surfaces typed edges
 * on the wire (the backend supplies `kind`; the schema doesn't echo
 * it yet).
 */
function projectEdge(e: BackendGraphEdge, index: number): GraphData['edges'][number] {
  return {
    id: `e-${index}`,
    source: e.source,
    target: e.target,
    kind: 'cites',
  };
}

export const liveGraphApi: ApiClient['graph'] = {
  forLaw: async (id, depth = 2) => {
    const raw = await http<BackendGraphSubgraph>(
      `/graph/subgraph/${encodeURIComponent(id)}?depth=${depth}`,
    );
    return {
      nodes: raw.nodes.map(projectNode),
      edges: raw.edges.map(projectEdge),
    };
  },
  global: async (filters: GraphGlobalFilters = {}) => {
    // `qs` strips `undefined` so callers can pass a sparse filter
    // bag. `total_available` carries the pre-truncation node count so
    // the SPA can render "showing N of M laws".
    const raw = await http<BackendGraphGlobal>(`/graph${qs({ ...filters })}`);
    const result: GraphGlobalResult = {
      nodes: raw.nodes.map(projectNode),
      edges: raw.edges.map(projectEdge),
      totalAvailable: raw.total_available,
    };
    return result;
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
