/**
 * `liveApi.chat` — threads CRUD + SSE send (#463 / #84).
 *
 * Wire shape matches `src/lexflow/api/routers/chat_threads.py`:
 *   GET    /chat/threads               → ChatThreadList
 *   POST   /chat/threads               → ChatThreadRead
 *   GET    /chat/threads/{id}          → ChatThreadDetail (with messages)
 *   PATCH  /chat/threads/{id}          → ChatThreadRead   (rename)
 *   DELETE /chat/threads/{id}          → 204
 *   POST   /chat/threads/{id}/send     → text/event-stream
 *
 * SSE wire format emitted by `lexflow.chat.streaming.format_sse`:
 *   event: text       data: {"delta": "..."}
 *   event: tool_call  data: {"call_id": "...", "name": "...", "args": {...}}
 *   event: source     data: {"law_id": "...", "article_number": "..."}
 *   event: error      data: {"detail": "..."}
 *   event: done       data: {}
 *
 * The SPA's `ChatChunk` discriminator doesn't carry `tool_result`
 * from the live backend — the agentic loop dispatches tools server-
 * side and surfaces citations as `source` events. We bridge
 * `tool_call` straight through and project `source` into the SPA's
 * `ChatSource` shape (law id + article number; full metadata is
 * resolved separately by ``useLaw`` when the user clicks).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Backend event names    → ``parseSseEvent`` below + the
 *                          ``SseEvent`` constants in
 *                          ``lexflow.chat.streaming``.
 * New SPA chunk type     → ``ChatChunk`` in ``lib/types.ts`` +
 *                          ``parseSseEvent`` + the consumer in
 *                          ``api.mock.applyChunk``.
 * Auth / cookies         → ``http`` in ``lib/api/http.ts``; this
 *                          file calls ``fetch`` directly for SSE
 *                          (raw ReadableStream) but inherits
 *                          same-origin cookies from the browser.
 */

import type {
  BackendChatMessageRead,
  BackendChatThreadDetail,
  BackendChatThreadList,
  BackendChatThreadRead,
} from '../../api';
import type {
  ApiClient,
  ChatChunk,
  ChatMessage,
  ChatSource,
  ChatThread,
} from '../types';
import { API_BASE, API_PREFIX, ApiError, http } from './http';

function threadFromWire(raw: BackendChatThreadRead): ChatThread {
  return {
    id: raw.id,
    title: raw.title,
    updatedAt: raw.updated_at,
    preview: raw.preview ?? undefined,
  };
}

/**
 * Project a persisted message into the SPA's discriminated shape.
 *
 * Tool turns carry ``name`` / ``args`` under ``payload`` and the
 * result text in ``content``. Assistant turns carry ``sources``
 * under ``payload``. System turns are dropped — the rail doesn't
 * render them.
 */
function messageFromWire(raw: BackendChatMessageRead): ChatMessage | null {
  const payload = (raw.payload ?? {}) as Record<string, unknown>;
  if (raw.role === 'user') {
    return { id: raw.id, role: 'user', createdAt: raw.created_at, content: raw.content };
  }
  if (raw.role === 'assistant') {
    const sources = Array.isArray(payload.sources) ? (payload.sources as ChatSource[]) : [];
    return {
      id: raw.id,
      role: 'assistant',
      createdAt: raw.created_at,
      content: [raw.content],
      sources,
    };
  }
  if (raw.role === 'tool') {
    return {
      id: raw.id,
      role: 'tool',
      createdAt: raw.created_at,
      name: typeof payload.name === 'string' ? payload.name : 'tool',
      args: (payload.args as Record<string, unknown>) ?? {},
      result: raw.content,
    };
  }
  return null;
}

/**
 * Parse one SSE event into a SPA ``ChatChunk``. Returns ``null`` for
 * payloads the SPA can't represent so the consumer can skip cleanly.
 */
function parseSseEvent(eventName: string, data: string): ChatChunk | null {
  if (!data) return eventName === 'done' ? { type: 'done' } : null;
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const obj = payload as Record<string, unknown>;
  switch (eventName) {
    case 'text': {
      const delta = typeof obj.delta === 'string' ? obj.delta : '';
      if (!delta) return null;
      return { type: 'text', delta };
    }
    case 'tool_call': {
      const name = typeof obj.name === 'string' ? obj.name : 'tool';
      const args = (obj.args as Record<string, unknown>) ?? {};
      return { type: 'tool_call', name, args };
    }
    case 'source': {
      const lawId = typeof obj.law_id === 'string' ? obj.law_id : '';
      const articleNum = typeof obj.article_number === 'string' ? obj.article_number : '';
      const source: ChatSource = {
        law: lawId,
        article: articleNum,
        date: '',
        snippet: '',
        target: lawId ? { lawId, articleNum: articleNum || undefined } : undefined,
      };
      return { type: 'source', source };
    }
    case 'error': {
      // The streaming layer emits a sanitised ``detail`` string.
      // Surface it as a synthesised final text delta so the rail at
      // least shows what went wrong instead of an empty turn.
      const detail = typeof obj.detail === 'string' ? obj.detail : 'Provider error';
      return { type: 'text', delta: `\n\n⚠️ ${detail}` };
    }
    case 'done':
      return { type: 'done' };
    default:
      return null;
  }
}

/**
 * Async generator over the SSE stream. Splits the body on the blank-
 * line event boundary, reads ``event:`` + ``data:`` lines per block,
 * and forwards parsed chunks to the caller. Terminates on ``done``.
 */
async function* consumeSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator: number;
    while ((separator = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const rawLine of block.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^\s/, '');
        if (field === 'event') eventName = value;
        else if (field === 'data') dataLines.push(value);
      }
      const chunk = parseSseEvent(eventName, dataLines.join('\n'));
      if (chunk) {
        yield chunk;
        if (chunk.type === 'done') return;
      }
    }
  }
}

export const liveChatApi: ApiClient['chat'] = {
  threads: async () => {
    const raw = await http<BackendChatThreadList>('/chat/threads?page_size=100');
    return raw.items.map(threadFromWire);
  },
  thread: async (id) => {
    const raw = await http<BackendChatThreadDetail>(`/chat/threads/${encodeURIComponent(id)}`);
    const out: ChatMessage[] = [];
    for (const message of raw.messages ?? []) {
      const projected = messageFromWire(message);
      if (projected) out.push(projected);
    }
    return out;
  },
  create: async (opts = {}) => {
    const raw = await http<BackendChatThreadRead>('/chat/threads', {
      method: 'POST',
      body: JSON.stringify({
        title: opts.title ?? null,
        model: opts.model ?? null,
      }),
    });
    return threadFromWire(raw);
  },
  rename: async (threadId, title) => {
    const raw = await http<BackendChatThreadRead>(`/chat/threads/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    return threadFromWire(raw);
  },
  remove: async (threadId) => {
    await http<void>(`/chat/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' });
  },
  async *send(threadId, content, opts = {}) {
    // Raw fetch — not the shared ``http`` helper — because we need
    // the ReadableStream body; the SSE bytes never JSON-parse end-
    // to-end. ApiError is still raised on non-2xx so the global
    // toast handler surfaces the failure to the user.
    const url = `${API_BASE}${API_PREFIX}/chat/threads/${encodeURIComponent(threadId)}/send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: content,
        model: opts.model ?? '',
      }),
    });
    if (!response.ok) {
      let body: unknown = undefined;
      try {
        body = await response.json();
      } catch {
        /* not json */
      }
      throw new ApiError(response.status, body, `POST /chat/threads/${threadId}/send`);
    }
    if (!response.body) {
      throw new ApiError(response.status, null, 'Chat stream had no body');
    }
    yield* consumeSse(response.body);
  },
};
