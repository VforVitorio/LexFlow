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
import type { ApiClient, HealthSnapshot } from '../types';
import { http } from './http';

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
};
