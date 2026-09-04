/**
 * Pure helpers for the daily app-update poll policy (#698).
 *
 * Checks run at most once per 24h — not on every cold start.
 */

export const APP_UPDATE_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

const LAST_CHECK_KEY = 'lexflow.appUpdate.lastCheckAt';

/** Whether a background check should run given the persisted timestamp. */
export function shouldPoll(lastCheckAt: number | null): boolean {
  if (lastCheckAt === null) return true;
  return Date.now() - lastCheckAt >= APP_UPDATE_POLL_INTERVAL_MS;
}

/** Milliseconds until the next scheduled poll (0 when overdue). */
export function msUntilNextPoll(lastCheckAt: number | null): number {
  if (lastCheckAt === null) return 0;
  const elapsed = Date.now() - lastCheckAt;
  return Math.max(0, APP_UPDATE_POLL_INTERVAL_MS - elapsed);
}

/** Read persisted last-check timestamp from localStorage. */
export function readLastCheckAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_CHECK_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist last-check timestamp (UTF-8 safe via localStorage). */
export function persistLastCheckAt(at: number): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(at));
  } catch {
    /* private mode */
  }
}
