/**
 * `liveApi.system` — process introspection.
 *
 * Three endpoints:
 *   - `warmup` (#222): three-tier warm-up progress polled by SplashGate.
 *   - `whatsNew` (#228): corpus diff since the last recorded commit,
 *     consumed by the WhatsNewPanel inside SplashGate.
 *   - `profile` (#117): hardware + local LLM providers, consumed by the
 *     model wizard during onboarding.
 *
 * All three flip snake_case wire → camelCase SPA shape.
 */

import type {
  BackendSystemProfile,
  BackendWarmupStatus,
  BackendWhatsNewResponse,
} from '../../api';
import type { ApiClient, HealthSnapshot, SemanticInstallEvent, SemanticStatus } from '../types';
import { API_BASE, API_PREFIX, ApiError, http } from './http';

/**
 * Wire shape of ``GET /api/v1/system/health``. The Pydantic model is
 * snake_case + nested; we keep the types local to the file so the
 * SPA-facing ``HealthSnapshot`` stays camelCase.
 */
interface BackendHealthSnapshot {
  status: 'ok' | 'degraded';
  version: string;
  uptime_seconds: number;
  memory: { rss_mb: number; system_used_percent: number };
  disk: {
    path: string;
    total_gb: number;
    used_gb: number;
    free_gb: number;
    used_percent: number;
  };
  corpus: { submodule_present: boolean; laws_indexed: number };
  chat_db: { reachable: boolean };
}

export const liveSystemApi: ApiClient['system'] = {
  warmup: async () => {
    const raw = await http<BackendWarmupStatus>('/system/warmup');
    return {
      ready: raw.ready,
      metadataReady: raw.metadata_ready,
      searchReady: raw.search_ready,
      graphReady: raw.graph_ready,
      error: raw.error ?? null,
      durationsSeconds: raw.durations_seconds ?? {},
    };
  },
  whatsNew: async (since: string | null) => {
    const url = since ? `/system/whats-new?since=${encodeURIComponent(since)}` : '/system/whats-new';
    const raw = await http<BackendWhatsNewResponse>(url);
    const corpus = raw.corpus;
    return {
      fromCommit: corpus.from_commit ?? null,
      toCommit: corpus.to_commit ?? null,
      added: (corpus.added ?? []).map((l) => ({ lawId: l.law_id, title: l.title ?? null })),
      modified: (corpus.modified ?? []).map((l) => ({ lawId: l.law_id, title: l.title ?? null })),
      removed: corpus.removed ?? [],
    };
  },
  profile: async () => {
    const raw = await http<BackendSystemProfile>('/system/profile');
    return {
      totalRamGb: raw.total_ram_gb,
      availableRamGb: raw.available_ram_gb,
      cpuCores: raw.cpu_cores,
      hasNvidiaGpu: raw.has_nvidia_gpu,
      vramGb: raw.vram_gb ?? null,
      gpuName: raw.gpu_name ?? null,
      isAppleSilicon: raw.is_apple_silicon,
      platform: raw.platform,
      ollamaRunning: raw.ollama_running,
      ollamaModels: raw.ollama_models ?? [],
      lmstudioRunning: raw.lmstudio_running,
    };
  },
  health: async (): Promise<HealthSnapshot> => {
    const raw = await http<BackendHealthSnapshot>('/system/health');
    return {
      status: raw.status,
      version: raw.version,
      uptimeSeconds: raw.uptime_seconds,
      memory: {
        rssMb: raw.memory.rss_mb,
        systemUsedPercent: raw.memory.system_used_percent,
      },
      disk: {
        path: raw.disk.path,
        totalGb: raw.disk.total_gb,
        usedGb: raw.disk.used_gb,
        freeGb: raw.disk.free_gb,
        usedPercent: raw.disk.used_percent,
      },
      corpus: {
        submodulePresent: raw.corpus.submodule_present,
        lawsIndexed: raw.corpus.laws_indexed,
      },
      chatDb: {
        reachable: raw.chat_db.reachable,
      },
    };
  },
  // The wire shape is already flat single-word fields, so no
  // snake_case→camelCase flip is needed here.
  semanticStatus: async (): Promise<SemanticStatus> => {
    return http<SemanticStatus>('/system/semantic-status');
  },
  installSemantic: () => streamSemanticInstall(),
};

/**
 * Consume the `POST /api/v1/system/semantic-install` SSE stream (#578).
 *
 * Same wire format and parsing strategy as `models.pull`'s `streamPull`
 * (event + data pair, blank-line separator). Ends on `done` OR `error`.
 */
async function* streamSemanticInstall(): AsyncIterable<SemanticInstallEvent> {
  const url = `${API_BASE}${API_PREFIX}/system/semantic-install`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, detail || response.statusText);
  }
  if (!response.body) {
    throw new ApiError(500, 'Empty response body from semantic-install endpoint');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const rawEvent = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf('\n\n');
      const parsed = parseSemanticEvent(rawEvent);
      if (parsed) yield parsed;
    }
  }
}

/** Parse one ``event: X\ndata: {...}`` block into a `SemanticInstallEvent`. */
function parseSemanticEvent(raw: string): SemanticInstallEvent | null {
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
    return { type: 'progress', status: String(payload.status ?? '') };
  }
  if (eventName === 'done') {
    return { type: 'done', package: String(payload.package ?? '') };
  }
  if (eventName === 'error') {
    return {
      type: 'error',
      code: String(payload.code ?? 'unknown'),
      message: String(payload.message ?? 'Install failed'),
    };
  }
  return null;
}
