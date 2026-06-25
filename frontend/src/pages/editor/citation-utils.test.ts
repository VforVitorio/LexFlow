/**
 * Tests for `citation-utils.ts` (#599).
 *
 * `citationFromHit` is the only non-trivial logic in the typed-citation
 * feature: it resolves a corpus search hit into the attributes stored on the
 * editor node. A regression here would insert citations that point nowhere or
 * render with the wrong label.
 */

import { describe, expect, it } from 'vitest';
import type { ChatSource, SearchHit } from '@/lib/types';
import { citationFromHit, citationFromSource } from './citation-utils';

function makeHit(overrides: Partial<SearchHit>): SearchHit {
  return {
    kind: 'law',
    id: 'BOE-A-1978-31229',
    title: 'Constitución Española',
    payload: { lawId: 'BOE-A-1978-31229' },
    ...overrides,
  };
}

describe('citationFromHit', () => {
  it('resolves a law hit (no article)', () => {
    const attrs = citationFromHit(makeHit({}));
    expect(attrs).toEqual({
      lawId: 'BOE-A-1978-31229',
      articleNum: null,
      label: 'Constitución Española',
    });
  });

  it('prefixes the article number when the title is the parent law (live shape)', () => {
    const attrs = citationFromHit(
      makeHit({
        kind: 'article',
        id: 'BOE-A-1978-31229::14',
        title: 'Constitución Española',
        articleNumber: '14',
        payload: { lawId: 'BOE-A-1978-31229', articleNum: '14' },
      }),
    );
    expect(attrs).toEqual({
      lawId: 'BOE-A-1978-31229',
      articleNum: '14',
      label: 'Art. 14 · Constitución Española',
    });
  });

  it('uses an article title verbatim when it already starts with "Art" (mock shape)', () => {
    const attrs = citationFromHit(
      makeHit({
        kind: 'article',
        title: 'Art. 14 — Igualdad ante la ley',
        articleNumber: '14',
        payload: { lawId: 'BOE-A-1978-31229', articleNum: '14' },
      }),
    );
    expect(attrs?.label).toBe('Art. 14 — Igualdad ante la ley');
    expect(attrs?.articleNum).toBe('14');
  });

  it('returns null when the hit has no resolvable lawId', () => {
    expect(citationFromHit(makeHit({ payload: {} }))).toBeNull();
    expect(citationFromHit(makeHit({ payload: undefined }))).toBeNull();
  });
});

describe('citationFromSource', () => {
  const source: ChatSource = {
    law: 'Ley Orgánica 3/2018 (LOPDGDD)',
    article: 'Art. 28',
    date: '2018-12-06',
    snippet: '…',
    target: { lawId: 'LO-3-2018', articleNum: '28' },
  };

  it('maps an article-scoped source to a citation', () => {
    expect(citationFromSource(source)).toEqual({
      lawId: 'LO-3-2018',
      articleNum: '28',
      label: 'Art. 28 · Ley Orgánica 3/2018 (LOPDGDD)',
    });
  });

  it('maps a law-only source (no article) to a citation', () => {
    const attrs = citationFromSource({ ...source, article: '', target: { lawId: 'LO-3-2018' } });
    expect(attrs).toEqual({
      lawId: 'LO-3-2018',
      articleNum: null,
      label: 'Ley Orgánica 3/2018 (LOPDGDD)',
    });
  });

  it('returns null when the source has no resolved target', () => {
    expect(citationFromSource({ ...source, target: undefined })).toBeNull();
  });
});
