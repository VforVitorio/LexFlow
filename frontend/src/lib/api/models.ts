/**
 * `liveApi.models` — flat list of `(provider, model)` pairs (#82) + Ollama
 * pull streaming (#119).
 *
 * Unconfigured providers surface as placeholder rows with
 * `available=false` instead of being hidden, so the Settings page
 * can render them with a "needs setup" hint and the user knows the
 * full set of options upfront.
 */

import type { BackendModelInfo } from '../../api';
import type { ApiClient, Model, ModelPullEvent } from '../types';
import { API_BASE, API_PREFIX, ApiError, http } from './http';

export const liveModelsApi: ApiClient['models'] = {
  list: async () => {
    const raw = await http<BackendModelInfo[]>('/models');
    return raw.map<Model>((m) => ({
      id: m.id,
      // Placeholder rows have no model name — fall back to the provider key
      // so the Settings list still renders something legible.
      label: m.model || m.provider,
      vendor: m.provider,
      kind: m.local ? 'local' : 'cloud',
      available: m.configured,
    }));
  },
  pull: (model: string) => streamPull(model),
};

/**
 * Consume the `POST /api/v1/models/pull` SSE stream and yield typed events.
 *
 * Notes for callers:
 *   - The stream ends on `done` OR `error` — neither is followed by more
 *     events. The wizard surfaces both as terminal states.
 *   - Cancelling the iterator (e.g. via an AbortController on a future
 *     refactor, or the user closing the wizard) hangs up cleanly because
 *     `ReadableStream` cancellation propagates to the backend.
 *   - Parses one event at a time from the SSE wire format (event + data
 *     pair, blank-line separator). Anything malformed is skipped silently
 *     — the contract is "send valid events or bust".
 */
async function* streamPull(model: string): AsyncIterable<ModelPullEvent> {
  const url = `${API_BASE}${API_PREFIX}/models/pull`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, detail || response.statusText);
  }
  if (!response.body) {
    throw new ApiError(500, 'Empty response body from pull endpoint');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line (\n\n). Pull complete
    // events off the front of the buffer; partial trailing chunks stay
    // for the next read.
    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const rawEvent = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf('\n\n');
      const parsed = parseEvent(rawEvent);
      if (parsed) yield parsed;
    }
  }
}

/** Parse one ``event: X\ndata: {...}`` block into a typed `ModelPullEvent`. */
function parseEvent(raw: string): ModelPullEvent | null {
  let eventName: string | null = null;
  const dataParts: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event: ')) eventName = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataParts.push(line.slice(6));
  }
  if (!eventName || dataParts.length === 0) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataParts.join('\n'));
  } catch {
    return null;
  }
  if (eventName === 'progress') {
    return {
      type: 'progress',
      status: (payload.status as string | null) ?? null,
      completed: (payload.completed as number | null) ?? null,
      total: (payload.total as number | null) ?? null,
      digest: (payload.digest as string | null) ?? null,
    };
  }
  if (eventName === 'done') {
    return { type: 'done', model: String(payload.model ?? '') };
  }
  if (eventName === 'error') {
    return {
      type: 'error',
      code: String(payload.code ?? 'unknown'),
      message: String(payload.message ?? 'Pull failed'),
    };
  }
  return null;
}
