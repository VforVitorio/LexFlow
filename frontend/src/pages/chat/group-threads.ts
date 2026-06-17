/**
 * Thread time-bucketing for the chat rail sidebar.
 *
 * Extracted from `ChatPage` to shrink that god component and make the
 * logic unit-testable (#556). It is pure (no React, no I/O) and
 * language-agnostic — the caller translates bucket labels via
 * `t('chat.groups.<bucket>')`.
 *
 * WHERE TO CHANGE IF X CHANGES: if the backend starts returning
 * pre-grouped threads, delete this module and remove the `groupThreads`
 * call from `ChatPage`.
 */

/** Recency buckets for the rail sidebar. Keys map to `chat.groups.<key>`. */
export type ThreadBucket = 'today' | 'yesterday' | 'week';

/** Minimal thread shape required for bucketing. */
export interface ThreadStub {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * Bucket `threads` by recency into stable keys.
 *
 * Returns only buckets that contain at least one thread, preserving
 * server order within each bucket. The keys map to `chat.groups.<key>`
 * in the locale files — the caller translates the label so this stays
 * pure and language-agnostic.
 *
 * @param threads - Flat list of threads, typically from `useChatThreads`.
 * @param now     - Current timestamp in ms (default: `Date.now()`). Injected
 *                  for deterministic tests.
 * @returns Ordered pairs of `[bucket, threads]` with empty buckets omitted.
 */
export function groupThreads(
  threads: ThreadStub[],
  now: number = Date.now(),
): [ThreadBucket, ThreadStub[]][] {
  const today: ThreadStub[] = [];
  const yesterday: ThreadStub[] = [];
  const week: ThreadStub[] = [];

  for (const thread of threads) {
    const age = (now - new Date(thread.updatedAt).getTime()) / 86_400_000;
    if (age < 1) today.push(thread);
    else if (age < 2) yesterday.push(thread);
    else week.push(thread);
  }

  return (
    [
      ['today', today],
      ['yesterday', yesterday],
      ['week', week],
    ] as [ThreadBucket, ThreadStub[]][]
  ).filter(([, list]) => list.length > 0);
}
