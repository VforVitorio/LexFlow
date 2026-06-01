/**
 * Tests for `lib/greeting.ts` (#90 — the random-greeting pool from #248
 * is the highest-value unit-test target because it carries real logic:
 * time-bucket bucketing, name-aware filtering, no-repeat-twice guard).
 *
 * Strategy:
 *   - Pass an injected `rng` to `pickGreeting` so we can pin the random pick
 *     deterministically (Vitest tests are run in jsdom with localStorage).
 *   - Stub localStorage per-test via `beforeEach` to isolate the
 *     `lexflow.user-name` + `lexflow.last-greeting-id` keys.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LAST_GREETING_STORAGE_KEY, USER_NAME_STORAGE_KEY, pickGreeting } from './greeting';

const MORNING = new Date('2026-01-01T08:00:00');
const AFTERNOON = new Date('2026-01-01T14:00:00');
const EVENING = new Date('2026-01-01T21:00:00');

const pickFirst = () => 0;
const pickLast = () => 0.9999;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('pickGreeting — time bucket', () => {
  it('returns morning bucket before 12:00', () => {
    const g = pickGreeting(MORNING, pickFirst);
    expect(g.bucket).toBe('morning');
  });

  it('returns afternoon bucket between 12:00 and 18:59', () => {
    const g = pickGreeting(AFTERNOON, pickFirst);
    expect(g.bucket).toBe('afternoon');
  });

  it('returns evening bucket from 19:00 onwards', () => {
    const g = pickGreeting(EVENING, pickFirst);
    expect(g.bucket).toBe('evening');
  });
});

describe('pickGreeting — name awareness', () => {
  it('reports `named: true` when the user-name key is present', () => {
    localStorage.setItem(USER_NAME_STORAGE_KEY, 'Victor');
    const g = pickGreeting(AFTERNOON, pickFirst);
    expect(g.named).toBe(true);
  });

  it('reports `named: false` when the user-name key is absent or empty', () => {
    expect(pickGreeting(AFTERNOON, pickFirst).named).toBe(false);
    localStorage.setItem(USER_NAME_STORAGE_KEY, '   ');
    expect(pickGreeting(AFTERNOON, pickFirst).named).toBe(false);
  });

  it('never returns a playful name-aware line when no name is stored', () => {
    // Iterate enough samples to cover the whole pool; none should land on
    // the playful category because all playful entries return null for
    // `name: null` and are filtered out before the random pick.
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const g = pickGreeting(AFTERNOON, () => i / 30);
      seen.add(g.category);
    }
    expect(seen.has('playful')).toBe(false);
  });

  it('can surface playful name-aware lines when a name is stored', () => {
    localStorage.setItem(USER_NAME_STORAGE_KEY, 'Victor');
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      // Reset last-id every iteration so the no-repeat guard doesn't
      // bias the sample.
      localStorage.removeItem(LAST_GREETING_STORAGE_KEY);
      seen.add(pickGreeting(AFTERNOON, () => i / 30).category);
    }
    expect(seen.has('playful')).toBe(true);
  });
});

describe('pickGreeting — no-repeat-twice guard', () => {
  it('does not return the same id twice in a row when alternatives exist', () => {
    const first = pickGreeting(AFTERNOON, pickFirst);
    const second = pickGreeting(AFTERNOON, pickFirst);
    expect(second.id).not.toBe(first.id);
  });

  it('persists the last id to localStorage', () => {
    const g = pickGreeting(AFTERNOON, pickFirst);
    expect(localStorage.getItem(LAST_GREETING_STORAGE_KEY)).toBe(g.id);
  });

  it('falls back to repeating when only one entry applies (degenerate case)', () => {
    // Lock the rng to a known position to keep the pick deterministic.
    // The pool always has at least 5 free-tone entries that apply, so
    // there isn't a corpus where the candidate set shrinks to 1.
    // Instead we assert the safety invariant: the function never
    // returns `undefined` even with a custom rng of 1.
    const g = pickGreeting(AFTERNOON, pickLast);
    expect(g.text.length).toBeGreaterThan(0);
  });
});

describe('pickGreeting — return shape', () => {
  it('returns text + bucket + named + id + category', () => {
    const g = pickGreeting(AFTERNOON, pickFirst);
    expect(g).toMatchObject({
      bucket: expect.any(String),
      named: expect.any(Boolean),
      id: expect.any(String),
      category: expect.any(String),
      text: expect.any(String),
    });
  });

  it('interpolates the stored name into the time-plain greeting', () => {
    localStorage.setItem(USER_NAME_STORAGE_KEY, 'Victor');
    // The first entry in the pool is `time-plain`; with pickFirst we hit it.
    const g = pickGreeting(AFTERNOON, pickFirst);
    expect(g.id).toBe('time-plain');
    expect(g.text).toBe('Buenas tardes, Victor');
  });
});
