/**
 * Tauri updater adapter stub until #128 lands.
 *
 * Mapping for the real implementer:
 *   check()              → `check()` from `@tauri-apps/plugin-updater`
 *   download(onProgress) → `download()` + `onProgress` event
 *   installAndRelaunch() → `install()` then `relaunch()`
 *
 * No `@tauri-apps/*` compile-time dependency in this issue.
 */

import type { UpdaterService } from './updater-service';

export class TauriUpdaterService implements UpdaterService {
  async check(): Promise<{ update: null }> {
    return { update: null };
  }

  async download(): Promise<void> {
    throw new Error('Tauri updater not implemented — blocked on #128');
  }

  async installAndRelaunch(): Promise<void> {
    throw new Error('Tauri updater not implemented — blocked on #128');
  }
}
