/**
 * Unit tests for `groupThreads`.
 *
 * All tests inject `now` so they never depend on the real clock.
 */
import { describe, it, expect } from 'vitest';
import { groupThreads } from './group-threads';
import type { ThreadStub } from './group-threads';

/** Build a stub thread whose `updatedAt` is `hoursAgo` hours before `now`. */
function makeThread(id: string, hoursAgo: number, now: number): ThreadStub {
  return {
    id,
    title: `Thread ${id}`,
    updatedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  };
}

describe('groupThreads', () => {
  const NOW = new Date('2026-01-15T12:00:00Z').getTime();

  it('returns an empty array when given no threads', () => {
    expect(groupThreads([], NOW)).toEqual([]);
  });

  it('places a thread updated 30 min ago into "today"', () => {
    const thread = makeThread('a', 0.5, NOW);
    const result = groupThreads([thread], NOW);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('today');
    expect(result[0][1]).toEqual([thread]);
  });

  it('places a thread updated 25 hours ago into "yesterday"', () => {
    const thread = makeThread('b', 25, NOW);
    const result = groupThreads([thread], NOW);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('yesterday');
  });

  it('places a thread updated 3 days ago into "week"', () => {
    const thread = makeThread('c', 72, NOW);
    const result = groupThreads([thread], NOW);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe('week');
  });

  it('handles threads across all three buckets', () => {
    const t1 = makeThread('today-1', 0.5, NOW);
    const t2 = makeThread('yest-1', 25, NOW);
    const t3 = makeThread('week-1', 72, NOW);
    const result = groupThreads([t1, t2, t3], NOW);
    expect(result.map(([bucket]) => bucket)).toEqual(['today', 'yesterday', 'week']);
    expect(result[0][1]).toEqual([t1]);
    expect(result[1][1]).toEqual([t2]);
    expect(result[2][1]).toEqual([t3]);
  });

  it('omits empty buckets from the output', () => {
    const thread = makeThread('x', 0.5, NOW);
    const result = groupThreads([thread], NOW);
    // Only "today" has items; "yesterday" and "week" must not appear.
    expect(result.every(([bucket]) => bucket === 'today')).toBe(true);
  });

  it('preserves server order within a bucket', () => {
    const t1 = makeThread('first', 2, NOW);
    const t2 = makeThread('second', 3, NOW);
    const t3 = makeThread('third', 4, NOW);
    const result = groupThreads([t1, t2, t3], NOW);
    // All land in "week" — order should be preserved.
    expect(result[0][1].map((t) => t.id)).toEqual(['first', 'second', 'third']);
  });

  it('treats a thread updated exactly 1 day ago as "yesterday" (exclusive lower bound)', () => {
    // age === 1.0 exactly → not < 1, so lands in yesterday (age < 2).
    const thread = makeThread('edge', 24, NOW);
    const result = groupThreads([thread], NOW);
    expect(result[0][0]).toBe('yesterday');
  });

  it('uses Date.now() as the default when `now` is omitted', () => {
    // Smoke test: just verify it does not throw and returns a valid structure.
    const thread: ThreadStub = {
      id: 'smoke',
      title: 'Smoke',
      updatedAt: new Date().toISOString(),
    };
    const result = groupThreads([thread]);
    expect(result).toHaveLength(1);
    expect(['today', 'yesterday', 'week']).toContain(result[0][0]);
  });
});
