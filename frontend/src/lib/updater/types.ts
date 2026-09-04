/**
 * Desktop app update types — mirrors Tauri updater metadata for #128 wiring.
 */

/** Release metadata surfaced in the update notice. */
export type UpdateInfo = {
  version: string;
  currentVersion: string;
  notes: string;
  date?: string;
};

/** Download progress from the updater service. */
export type DownloadProgress = {
  downloaded: number;
  total: number | null;
};

/** Result of a background update check. */
export type UpdaterCheckResult = {
  update: UpdateInfo | null;
};

/** UI state machine for the non-blocking update notice. */
export type AppUpdateUiStatus =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'restarting'
  | 'error';
