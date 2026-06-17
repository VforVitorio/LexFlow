import { describe, expect, it } from 'vitest';

import type { Law } from '@/lib/types';

import { groupByRecency, recencyBucket } from './recency-groups';

/** Minimal Law stub — only `publicada` matters for recency logic. */
function law(id: string, publicada: string): Law {
  return {
    id,
    boe: `BOE-${id}`,
    title: 'Título',
    short: id,
    status: 'vigente',
    rango: 'Otro',
    publicada,
    ambito: 'Estatal',
    articulos: 0,
    referencias: 0,
    versiones: 0,
    tags: [],
  };
}

/** Reference point: 2024-06-15T12:00:00Z */
const NOW = new Date('2024-06-15T12:00:00Z');

describe('recencyBucket', () => {
  it('classifies a date from 30 min ago as today', () => {
    const d = new Date(NOW.getTime() - 30 * 60_000).toISOString();
    expect(recencyBucket(d, NOW)).toBe('today');
  });

  it('classifies a date from 23 h ago as today', () => {
    const d = new Date(NOW.getTime() - 23 * 3_600_000).toISOString();
    expect(recencyBucket(d, NOW)).toBe('today');
  });

  it('classifies a date from exactly 1 day ago as yesterday', () => {
    const d = new Date(NOW.getTime() - 24 * 3_600_000).toISOString();
    expect(recencyBucket(d, NOW)).toBe('yesterday');
  });

  it('classifies a date from 3 days ago as this-week', () => {
    const d = new Date(NOW.getTime() - 3 * 86_400_000).toISOString();
    expect(recencyBucket(d, NOW)).toBe('this-week');
  });

  it('classifies a date from 15 days ago as this-month', () => {
    const d = new Date(NOW.getTime() - 15 * 86_400_000).toISOString();
    expect(recencyBucket(d, NOW)).toBe('this-month');
  });

  it('classifies a date from 45 days ago as older', () => {
    const d = new Date(NOW.getTime() - 45 * 86_400_000).toISOString();
    expect(recencyBucket(d, NOW)).toBe('older');
  });

  it('uses ISO date strings without time component (treats as midnight UTC)', () => {
    // A plain date string: "2024-06-15" — same calendar day but parsed as
    // midnight UTC. NOW is noon UTC the same day, so difference < 1 day.
    expect(recencyBucket('2024-06-15', NOW)).toBe('today');
  });
});

describe('groupByRecency', () => {
  it('returns groups in BUCKET_ORDER, omitting empty buckets', () => {
    const laws = [
      law('a', new Date(NOW.getTime() - 30 * 60_000).toISOString()),      // today
      law('b', new Date(NOW.getTime() - 3 * 86_400_000).toISOString()),   // this-week
      law('c', new Date(NOW.getTime() - 15 * 86_400_000).toISOString()),  // this-month
    ];
    const groups = groupByRecency(laws, NOW);
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'this-week', 'this-month']);
  });

  it('places each law under the correct bucket', () => {
    const todayIso = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const weekIso = new Date(NOW.getTime() - 4 * 86_400_000).toISOString();
    const laws = [law('x', todayIso), law('y', weekIso), law('z', todayIso)];
    const groups = groupByRecency(laws, NOW);
    expect(groups.find((g) => g.bucket === 'today')?.items.map((l) => l.id)).toEqual(['x', 'z']);
    expect(groups.find((g) => g.bucket === 'this-week')?.items.map((l) => l.id)).toEqual(['y']);
  });

  it('returns an empty array when given no laws', () => {
    expect(groupByRecency([], NOW)).toEqual([]);
  });

  it('collects all laws into "older" when all are old', () => {
    const laws = [
      law('a', '2020-01-01'),
      law('b', '2019-06-15'),
    ];
    const groups = groupByRecency(laws, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe('older');
    expect(groups[0].items.map((l) => l.id)).toEqual(['a', 'b']);
  });
});
