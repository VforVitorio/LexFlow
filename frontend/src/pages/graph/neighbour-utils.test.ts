import { describe, expect, it } from 'vitest';

import type { GraphEdge, GraphNode } from '@/lib/types';

import { buildNodeIndex, resolveNeighbourNodes } from './neighbour-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return { id, kind: 'law', label: id, ...overrides };
}

function edge(id: string, source: string, target: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return { id, source, target, ...overrides };
}

// ─── buildNodeIndex ───────────────────────────────────────────────────────────

describe('buildNodeIndex', () => {
  it('returns an empty Map for an empty array', () => {
    expect(buildNodeIndex([])).toEqual(new Map());
  });

  it('indexes every node by id', () => {
    const a = node('a');
    const b = node('b', { kind: 'article' });
    const index = buildNodeIndex([a, b]);
    expect(index.get('a')).toBe(a);
    expect(index.get('b')).toBe(b);
    expect(index.size).toBe(2);
  });

  it('last entry wins on duplicate ids', () => {
    const first = node('a', { label: 'first' });
    const second = node('a', { label: 'second' });
    const index = buildNodeIndex([first, second]);
    expect(index.get('a')?.label).toBe('second');
  });
});

// ─── resolveNeighbourNodes ────────────────────────────────────────────────────

describe('resolveNeighbourNodes', () => {
  const nodeA = node('a');
  const nodeB = node('b', { kind: 'article' });
  const nodeC = node('c', { kind: 'reference' });
  const nodeD = node('d');
  const index = buildNodeIndex([nodeA, nodeB, nodeC, nodeD]);

  const edges = [
    edge('e1', 'a', 'b'),  // a → b (touches a)
    edge('e2', 'c', 'a'),  // c → a (touches a)
    edge('e3', 'b', 'd'),  // b → d (does NOT touch a)
    edge('e4', 'a', 'c'),  // a → c (touches a)
  ];

  it('returns [] when selectedId is null', () => {
    expect(resolveNeighbourNodes(edges, index, null)).toEqual([]);
  });

  it('returns [] when no edge touches selectedId', () => {
    expect(resolveNeighbourNodes(edges, index, 'x')).toEqual([]);
  });

  it('returns only edges that touch the selected node', () => {
    const result = resolveNeighbourNodes(edges, index, 'a');
    expect(result.map((r) => r.edge.id).sort()).toEqual(['e1', 'e2', 'e4']);
  });

  it('resolves the correct other-end node for each edge direction', () => {
    const result = resolveNeighbourNodes(edges, index, 'a');
    const byEdge = Object.fromEntries(result.map((r) => [r.edge.id, r.otherNode.id]));
    expect(byEdge['e1']).toBe('b');  // a → b; other = b
    expect(byEdge['e2']).toBe('c');  // c → a; other = c
    expect(byEdge['e4']).toBe('c');  // a → c; other = c
  });

  it('sets otherId as a convenience alias for otherNode.id', () => {
    const result = resolveNeighbourNodes(edges, index, 'a');
    for (const r of result) {
      expect(r.otherId).toBe(r.otherNode.id);
    }
  });

  it('skips edges whose other-end node is absent from the index', () => {
    const danglingEdge = edge('e_dangle', 'a', 'missing');
    const result = resolveNeighbourNodes([danglingEdge], index, 'a');
    expect(result).toEqual([]);
  });

  it('caps the result at 12 neighbours', () => {
    // Build 15 edges all touching 'a'
    const manyEdges = Array.from({ length: 15 }, (_, i) =>
      edge(`ex${i}`, 'a', 'b'),
    );
    const result = resolveNeighbourNodes(manyEdges, index, 'a');
    expect(result.length).toBe(12);
  });
});
