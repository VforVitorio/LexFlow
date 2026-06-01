/**
 * Tests for `lib/utils.ts` — small pure utilities used everywhere
 * (#90). The Tailwind `cn` merger is the highest-value cover because
 * a regression there silently changes every styled component.
 */

import { describe, expect, it } from 'vitest';
import { cn, formatDate, formatNumber, groupBy, statusLabel } from './utils';

describe('cn (Tailwind class merger)', () => {
  it('concatenates string + array + object inputs', () => {
    expect(cn('a', ['b', 'c'], { d: true, e: false })).toBe('a b c d');
  });

  it('drops nullish + false entries', () => {
    expect(cn('a', null, undefined, false, 'b')).toBe('a b');
  });

  it('lets later Tailwind classes win over earlier conflicting ones', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});

describe('formatDate', () => {
  it('formats an ISO date with the es-ES locale', () => {
    // Intl output varies by node version; assert a stable contract:
    // contains the year + a 1-3 char month abbreviation.
    const out = formatDate('2024-03-15');
    expect(out).toMatch(/2024/);
    expect(out).toMatch(/mar/i);
  });

  it('returns em-dash for null / undefined', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('falls back to the raw string when the date is unparseable', () => {
    // `new Date('garbage').toString() === 'Invalid Date'` → Intl throws,
    // catch falls back to the raw ISO arg.
    const out = formatDate('not-a-date');
    expect(out).toBe('not-a-date');
  });
});

describe('formatNumber', () => {
  it('uses es-ES thousand separator', () => {
    // Intl uses a non-breaking space in es-ES; assert on the integer part
    // and the presence of any separator.
    expect(formatNumber(1234567)).toMatch(/^1[\s. ]234[\s. ]567$/);
  });

  it('returns zero verbatim', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('groupBy', () => {
  it('partitions an array by a key function', () => {
    const items = [
      { id: 1, kind: 'a' },
      { id: 2, kind: 'b' },
      { id: 3, kind: 'a' },
    ];
    const grouped = groupBy(items, (item) => item.kind);
    expect(grouped.a).toHaveLength(2);
    expect(grouped.b).toHaveLength(1);
    expect(grouped.a[0].id).toBe(1);
  });

  it('returns an empty object for an empty array', () => {
    const grouped = groupBy<{ x: string }, 'x'>([], (item) => item.x as 'x');
    expect(grouped).toEqual({});
  });
});

describe('statusLabel', () => {
  it('localises the four known states', () => {
    expect(statusLabel('vigente')).toBe('Vigente');
    expect(statusLabel('modificada')).toBe('Modificada');
    expect(statusLabel('derogada')).toBe('Derogada');
    expect(statusLabel('pendiente')).toBe('Pendiente');
  });

  it('passes unknown values through unchanged', () => {
    expect(statusLabel('unknown_status')).toBe('unknown_status');
  });
});
