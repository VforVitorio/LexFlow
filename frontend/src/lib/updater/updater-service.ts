/**
 * Thin interface for desktop app updates — UI talks only to this (#698).
 *
 * Real Tauri wiring lands in #128; dev/web uses `MockUpdaterService`.
 */

import type { DownloadProgress, UpdaterCheckResult } from './types';

export interface UpdaterService {
  /** Poll for an available update. Never downloads. */
  check(): Promise<UpdaterCheckResult>;
  /** Download after user consent. Emits progress until complete. */
  download(onProgress: (progress: DownloadProgress) => void): Promise<void>;
  /** Install downloaded update and relaunch the desktop app. */
  installAndRelaunch(): Promise<void>;
}
