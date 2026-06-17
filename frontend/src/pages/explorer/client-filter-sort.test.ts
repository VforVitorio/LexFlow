import { describe, expect, it } from 'vitest';

import type { Law } from '@/lib/types';

import { applyClientFilterSort } from './client-filter-sort';

function law(over: Partial<Law> & { id: string }): Law {
  return {
    boe: `BOE-${over.id}`,
    title: 'Título',
    short: over.id,
    status: 'vigente',
    rango: 'Otro',
    publicada: '2020-01-01',
    ambito: 'Estatal',
    articulos: 0,
    referencias: 0,
    versiones: 0,
    tags: [],
    ...over,
  };
}

describe('applyClientFilterSort', () => {
  const base = [
    law({ id: 'a', title: 'Ley de Protección de Datos', short: 'LOPD', referencias: 5, publicada: '2018-12-05', tags: ['datos', 'privacidad'] }),
    law({ id: 'b', title: 'Código Civil', short: 'CC', referencias: 50, publicada: '1889-07-24', tags: ['civil'] }),
    law({ id: 'c', title: 'Ley General Tributaria', short: 'LGT', referencias: 20, publicada: '2003-12-17', tags: ['tributario', 'datos'] }),
  ];
  const relevance = { plainQ: '', allTags: new Set<string>(), sort: 'relevance' as const };

  it('returns rows unchanged with no filter or sort', () => {
    expect(applyClientFilterSort(base, relevance).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by free text across title/short/boe, case-insensitive', () => {
    expect(applyClientFilterSort(base, { ...relevance, plainQ: 'ley' }).map((l) => l.id)).toEqual(['a', 'c']);
    expect(applyClientFilterSort(base, { ...relevance, plainQ: 'lopd' }).map((l) => l.id)).toEqual(['a']);
  });

  it('AND-filters by tags', () => {
    expect(applyClientFilterSort(base, { ...relevance, allTags: new Set(['datos']) }).map((l) => l.id)).toEqual(['a', 'c']);
    expect(
      applyClientFilterSort(base, { ...relevance, allTags: new Set(['datos', 'privacidad']) }).map((l) => l.id),
    ).toEqual(['a']);
  });

  it('sorts by refs, date and title; relevance preserves server order', () => {
    expect(applyClientFilterSort(base, { ...relevance, sort: 'refs' }).map((l) => l.id)).toEqual(['b', 'c', 'a']);
    expect(applyClientFilterSort(base, { ...relevance, sort: 'date' }).map((l) => l.id)).toEqual(['a', 'c', 'b']);
    expect(applyClientFilterSort(base, { ...relevance, sort: 'title' }).map((l) => l.id)).toEqual(['b', 'c', 'a']);
    expect(applyClientFilterSort(base, relevance).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
});
