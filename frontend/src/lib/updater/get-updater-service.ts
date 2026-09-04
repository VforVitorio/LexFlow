/**
 * Factory for the active `UpdaterService` — mock in dev/QA, stub in Tauri (#698).
 */

import type { UpdaterService } from './updater-service';
import { getMockUpdaterService } from './mock-updater-service';
import { TauriUpdaterService } from './tauri-updater-service';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Resolve updater service for the current runtime.
 *
 * Production browser SPA returns `null` — no desktop update prompts.
 */
export function getUpdaterService(): UpdaterService | null {
  if (import.meta.env.VITE_MOCK_APP_UPDATE === 'true') {
    return getMockUpdaterService();
  }
  if (isTauriRuntime()) {
    return new TauriUpdaterService();
  }
  if (import.meta.env.DEV) {
    return getMockUpdaterService();
  }
  return null;
}
