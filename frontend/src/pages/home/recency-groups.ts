/**
 * Pure recency-bucketing logic for the HomePage "Qué ha cambiado" feed.
 *
 * Extracted from `HomePage` to shrink that god component and make the
 * logic unit-testable (#556).
 *
 * WHERE TO CHANGE IF X CHANGES: if the bucket labels or thresholds change,
 * update `BUCKET_ORDER` / `recencyBucket` here AND the locale keys under
 * `home.buckets.<bucket>` in every `public/locales/<lang>/translation.json`.
 */
import type { Law } from '@/lib/types';

/** Date buckets for the "Qué ha cambiado" section.
 *
 * Labels live under `home.buckets.<bucket>` in the locale files — render
 * via `t()` in the page. */
export type RecencyBucket = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'older';

/** Canonical display order for recency buckets (most recent first). */
export const BUCKET_ORDER: RecencyBucket[] = ['today', 'yesterday', 'this-week', 'this-month', 'older'];

/**
 * Classify an ISO date string into a recency bucket relative to `now`.
 *
 * Thresholds (inclusive lower bound, exclusive upper bound):
 * - today      < 1 day ago
 * - yesterday  < 2 days ago
 * - this-week  < 7 days ago
 * - this-month < 30 days ago
 * - older      everything else
 */
export function recencyBucket(iso: string, now: Date): RecencyBucket {
  const days = (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return 'this-week';
  if (days < 30) return 'this-month';
  return 'older';
}

/** A single display group: a bucket label + the laws that fall into it. */
export interface RecencyGroup {
  bucket: RecencyBucket;
  items: Law[];
}

/**
 * Bucket an array of laws into recency groups for display.
 *
 * Groups are returned in `BUCKET_ORDER` (most recent first), with empty
 * buckets omitted. The caller is responsible for pre-sorting or slicing
 * `laws` before passing it here.
 */
export function groupByRecency(laws: Law[], now: Date): RecencyGroup[] {
  const map = new Map<RecencyBucket, Law[]>();
  for (const l of laws) {
    const b = recencyBucket(l.publicada, now);
    const arr = map.get(b) ?? [];
    arr.push(l);
    map.set(b, arr);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({ bucket, items: map.get(bucket)! }));
}
