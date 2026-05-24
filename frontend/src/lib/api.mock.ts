/**
 * Mock implementation of `ApiClient`. Returns from the in-memory seed data
 * with small artificial latency so loading states are exercised. Streaming
 * chat is simulated by yielding chunks of an assistant response on a timer.
 *
 * Activate by leaving `VITE_USE_MOCK=true` in `.env`. Swap to the real client
 * by setting `VITE_USE_MOCK=false` once the FastAPI side is up.
 */

import type {
  ApiClient, ChatChunk, ChatMessage, DiffResult, GraphData, ListLawsParams,
  Paginated, Law,
} from './types';
import {
  LAWS, LAW_DETAIL, ARTICLES, VERSIONS, DIFF_BY_LAW, GRAPH, CHAT_THREADS,
  CHAT_MESSAGES, MODELS, SYNC, COMPLIANCE_DASH,
} from './mock-data';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function filterLaws(params: ListLawsParams = {}): Law[] {
  let out = LAWS.slice();
  const q = params.q?.toLowerCase().trim();
  if (q) {
    out = out.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.short.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q) ||
        l.boe.toLowerCase().includes(q)
    );
  }
  if (params.status?.length) out = out.filter((l) => params.status!.includes(l.status));
  if (params.rango?.length) out = out.filter((l) => params.rango!.includes(l.rango));
  if (params.ambito?.length) out = out.filter((l) => params.ambito!.includes(l.ambito));
  if (params.tags?.length) {
    // AND-match — every requested tag must be present on the law.
    out = out.filter((l) => params.tags!.every((t) => l.tags?.includes(t)));
  }
  if (params.yearFrom) out = out.filter((l) => Number(l.publicada.slice(0, 4)) >= params.yearFrom!);
  if (params.yearTo) out = out.filter((l) => Number(l.publicada.slice(0, 4)) <= params.yearTo!);

  switch (params.sort) {
    case 'date': out.sort((a, b) => b.publicada.localeCompare(a.publicada)); break;
    case 'refs': out.sort((a, b) => b.referencias - a.referencias); break;
    case 'title': out.sort((a, b) => a.short.localeCompare(b.short, 'es')); break;
    default: /* relevance — leave seed order */ break;
  }
  return out;
}

export const mockApi: ApiClient = {
  laws: {
    async list(params = {}): Promise<Paginated<Law>> {
      await delay(160);
      const items = filterLaws(params);
      return { items, total: items.length, cursor: null };
    },
    async get(id) {
      await delay(180);
      const detail = LAW_DETAIL[id];
      if (detail) return detail;
      const base = LAWS.find((l) => l.id === id);
      if (!base) throw new Error(`law not found: ${id}`);
      return { ...base, hierarchy: [] };
    },
    async versions(id) {
      await delay(120);
      return VERSIONS[id] ?? [];
    },
    async diff(id, fromTag, toTag): Promise<DiffResult> {
      await delay(200);
      const versions = VERSIONS[id] ?? [];
      const from = versions.find((v) => v.tag === fromTag) ?? versions[0];
      const to = versions.find((v) => v.tag === toTag) ?? versions[versions.length - 1];
      const articles = DIFF_BY_LAW[id] ?? [];
      const totals = articles.reduce(
        (acc, a) => ({ added: acc.added + a.totals.added, removed: acc.removed + a.totals.removed, modified: acc.modified + 1 }),
        { added: 0, removed: 0, modified: 0 }
      );
      return { lawId: id, from, to, articles, totals };
    },
    async references(id) {
      await delay(140);
      return ARTICLES.filter((a) => a.lawId === id);
    },
  },
  articles: {
    async get(lawId, num) {
      await delay(120);
      const a = ARTICLES.find((x) => x.lawId === lawId && x.num === num);
      if (!a) throw new Error(`article not found: ${lawId}::${num}`);
      return a;
    },
  },
  tags: {
    async list() {
      await delay(60);
      const counts = new Map<string, number>();
      for (const l of LAWS) for (const t of l.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    },
  },
  graph: {
    async forLaw(_id, _depth): Promise<GraphData> {
      await delay(200);
      return GRAPH;
    },
    async neighbors(id) {
      await delay(120);
      // Direct successors from the in-memory graph. We treat the canned
      // GRAPH as bidirectional for the mock since the layout doesn't carry
      // direction; consumers just need a reasonable list to render.
      return GRAPH.edges
        .filter((e) => e.source === id || e.target === id)
        .map((e) => (e.source === id ? e.target : e.source));
    },
    async path(from, to) {
      await delay(120);
      // Tiny BFS over the canned graph so the mock returns a plausible
      // walk between two nodes. Returns [] (404-equivalent) when no path
      // exists; the consumer treats both the same.
      const adj = new Map<string, string[]>();
      for (const e of GRAPH.edges) {
        adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
        adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
      }
      const queue: string[][] = [[from]];
      const seen = new Set<string>([from]);
      while (queue.length) {
        const path = queue.shift()!;
        const last = path[path.length - 1];
        if (last === to) return path;
        for (const next of adj.get(last) ?? []) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push([...path, next]);
        }
      }
      return [];
    },
    async top(opts = {}) {
      await delay(120);
      const limit = opts.limit ?? 10;
      // Rank canned nodes by degree as a stand-in for PageRank.
      const counts = new Map<string, number>();
      for (const e of GRAPH.edges) {
        counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
        counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([lawId, deg]) => {
          const node = GRAPH.nodes.find((n) => n.id === lawId);
          return { lawId, score: deg / Math.max(1, GRAPH.edges.length), title: node?.label ?? null };
        });
    },
    async stats() {
      await delay(80);
      const nodeCount = GRAPH.nodes.length;
      const edgeCount = GRAPH.edges.length;
      const maxEdges = Math.max(1, nodeCount * (nodeCount - 1));
      return {
        nodeCount,
        edgeCount,
        density: Number((edgeCount / maxEdges).toFixed(6)),
        // The canned graph is small and roughly connected; one component
        // is the honest answer.
        weaklyConnectedComponents: 1,
      };
    },
  },
  search: {
    async universal(q) {
      await delay(120);
      const ql = q.toLowerCase().trim();

      // `#tag` (or starts with #) → return all laws that carry that tag.
      // Multiple #tags AND together; free-text after #tags also narrows by text.
      const tokens = ql.split(/\s+/).filter(Boolean);
      const tagTokens = tokens.filter((t) => t.startsWith('#')).map((t) => t.slice(1));
      const textTokens = tokens.filter((t) => !t.startsWith('#'));
      const tagged = tagTokens.length > 0;

      const lawsMatching = LAWS.filter((l) => {
        if (tagged && !tagTokens.every((t) => l.tags?.some((lt) => lt.includes(t)))) return false;
        if (textTokens.length) {
          const hay = `${l.short} ${l.title} ${l.id}`.toLowerCase();
          if (!textTokens.every((t) => hay.includes(t))) return false;
        }
        return true;
      });

      const lawHits = lawsMatching.slice(0, 8).map((l) => ({
        kind: 'law' as const, id: l.id,
        title: `${l.id} · ${l.short}`,
        subtitle: `${l.status} · ${l.versiones} versiones${l.tags?.length ? ' · ' + l.tags.slice(0, 3).map((t) => '#' + t).join(' ') : ''}`,
        payload: { lawId: l.id },
      }));

      const articleHits = ARTICLES.filter((a) => `art ${a.num} ${a.titulo}`.toLowerCase().includes(textTokens.join(' ') || ql)).slice(0, 5).map((a) => ({
        kind: 'article' as const, id: a.id,
        title: `Art. ${a.num} — ${a.titulo}`,
        subtitle: LAWS.find((l) => l.id === a.lawId)?.short,
        payload: { lawId: a.lawId, articleNum: a.num },
      }));

      const hits = [...lawHits, ...articleHits];
      return { hits, total: hits.length };
    },
  },
  chat: {
    async threads() {
      await delay(120);
      return CHAT_THREADS;
    },
    async thread(id) {
      await delay(140);
      return CHAT_MESSAGES[id] ?? [];
    },
    async *send(_threadId, _content, _opts): AsyncGenerator<ChatChunk> {
      // Simulate a streamed reply with a couple of tool calls in front.
      await delay(220);
      yield { type: 'tool_call', name: 'search_corpus', args: { q: _content.slice(0, 40), limit: 5 } };
      await delay(280);
      yield { type: 'tool_result', name: 'search_corpus', result: '5 resultados encontrados' };
      await delay(180);

      const chunks = [
        'Voy a contestar usando ',
        '**las fuentes encontradas**',
        ' en el corpus.\n\n',
        'En síntesis: ',
        'la respuesta depende de la ',
        'norma vigente y de la jurisprudencia más reciente.',
      ];
      for (const c of chunks) { await delay(140); yield { type: 'text', delta: c }; }

      yield {
        type: 'source',
        source: {
          law: 'Ley Orgánica 3/2018 (LOPDGDD)',
          article: 'Art. 28',
          date: '2018-12-06',
          snippet: 'El responsable del tratamiento adoptará todas las medidas necesarias para cumplir el principio de responsabilidad activa…',
          target: { lawId: 'LO-3-2018', articleNum: '28' },
        },
      };
      await delay(100);
      yield { type: 'done' };
    },
  },
  models: {
    async list() {
      await delay(60);
      return MODELS;
    },
  },
  dashboards: {
    async metrics(preset) {
      await delay(200);
      if (preset === 'compliance') return COMPLIANCE_DASH;
      // Stub analytics — return the same shape with relabelled cards
      return {
        ...COMPLIANCE_DASH,
        preset: 'analytics',
        cards: COMPLIANCE_DASH.cards.map((c) => ({ ...c, title: c.title.replace('Compliance', 'Analytics') })),
      };
    },
  },
  sync: {
    async status() {
      await delay(80);
      return SYNC;
    },
    async run() {
      await delay(600);
    },
  },
};

/** Convert chat chunks into a mutable assistant message — used by ChatPage. */
export function applyChunk(message: ChatMessage | null, chunk: ChatChunk): ChatMessage | null {
  if (chunk.type === 'done') return message && message.role === 'assistant' ? { ...message, streaming: false } : message;
  if (chunk.type === 'text') {
    if (!message || message.role !== 'assistant') {
      return {
        id: crypto.randomUUID(), role: 'assistant', streaming: true,
        createdAt: new Date().toISOString(),
        content: [chunk.delta], sources: [],
      };
    }
    const next = [...message.content];
    next[next.length - 1] = (next[next.length - 1] ?? '') + chunk.delta;
    return { ...message, content: next };
  }
  if (chunk.type === 'source' && message?.role === 'assistant') {
    return { ...message, sources: [...message.sources, chunk.source] };
  }
  return message;
}
