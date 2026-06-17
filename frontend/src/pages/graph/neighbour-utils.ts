/**
 * Pure graph-neighbour utilities for GraphPage.
 *
 * Extracted from `GraphPage` to shrink that god component and make the
 * data-shaping logic unit-testable (#556). Neither function touches React
 * or any hook — they transform plain `GraphData` values.
 *
 * WHERE TO CHANGE IF X CHANGES: if `GraphNode` or `GraphEdge` gain new
 * fields that affect neighbour resolution (e.g. weight, directionality
 * flags), update `NeighbourEdge` and `resolveNeighbourNodes` here.
 */
import type { GraphData, GraphNode, GraphEdge } from '@/lib/types';

/** Maximum number of neighbour edges surfaced in the right-rail. */
const MAX_NEIGHBOURS = 12;

/**
 * Build a stable `id → GraphNode` index from a node array.
 *
 * Use the result inside a `useMemo` keyed on `graph.nodes` to avoid
 * rebuilding the map on every render.
 *
 * @param nodes - The node list from a `GraphData` response.
 * @returns A `Map` keyed by node id.
 */
export function buildNodeIndex(nodes: GraphData['nodes']): Map<string, GraphNode> {
  const index = new Map<string, GraphNode>();
  for (const node of nodes) {
    index.set(node.id, node);
  }
  return index;
}

/**
 * One resolved neighbour: the raw edge plus the `GraphNode` on the other end.
 *
 * `otherNode` is never `undefined` — `resolveNeighbourNodes` skips edges
 * whose other endpoint is absent from `nodeIndex`.
 */
export interface ResolvedNeighbour {
  edge: GraphEdge;
  /** The node on the far end of `edge` (not the selected node). */
  otherNode: GraphNode;
  /** Id of the other node — convenience alias for `otherNode.id`. */
  otherId: string;
}

/**
 * Return the resolved neighbours for the currently selected node.
 *
 * Finds every edge that touches `selectedId`, resolves the far endpoint
 * via `nodeIndex`, discards edges whose endpoint is missing, and caps
 * the result at `MAX_NEIGHBOURS` to avoid flooding the right-rail.
 *
 * Returns an empty array when `selectedId` is `null`.
 *
 * @param edges      - Full edge list from a `GraphData` response.
 * @param nodeIndex  - Pre-built index from `buildNodeIndex`.
 * @param selectedId - Currently selected node id, or `null`.
 */
export function resolveNeighbourNodes(
  edges: GraphData['edges'],
  nodeIndex: Map<string, GraphNode>,
  selectedId: string | null,
): ResolvedNeighbour[] {
  if (!selectedId) return [];

  const result: ResolvedNeighbour[] = [];

  for (const edge of edges) {
    if (result.length >= MAX_NEIGHBOURS) break;

    const isTouching = edge.source === selectedId || edge.target === selectedId;
    if (!isTouching) continue;

    const otherId = edge.source === selectedId ? edge.target : edge.source;
    const otherNode = nodeIndex.get(otherId);
    if (!otherNode) continue;

    result.push({ edge, otherNode, otherId });
  }

  return result;
}
