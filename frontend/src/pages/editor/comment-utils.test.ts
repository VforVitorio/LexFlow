/**
 * Tests for `comment-utils.ts` (#602).
 *
 * The doc-scoping + resolved filter is what keeps the panel showing the right
 * annotations for the open document; a regression would leak another doc's
 * comments or hide active ones.
 */
import { describe, expect, it } from 'vitest';
import type { DocComment } from '@/lib/comment-store';
import { filterDocComments, openCommentCount } from './comment-utils';

function makeComment(over: Partial<DocComment>): DocComment {
  return { id: 'x', docId: 'draft', quote: 'q', note: '', createdAt: '2026-01-01T00:00:00.000Z', resolved: false, ...over };
}

const comments: Record<string, DocComment> = {
  a: makeComment({ id: 'a', docId: 'draft', createdAt: '2026-01-01T00:00:02.000Z' }),
  b: makeComment({ id: 'b', docId: 'draft', createdAt: '2026-01-01T00:00:01.000Z', resolved: true }),
  c: makeComment({ id: 'c', docId: 'other', createdAt: '2026-01-01T00:00:00.000Z' }),
};

describe('filterDocComments', () => {
  it('keeps only the doc, sorted oldest first', () => {
    expect(filterDocComments(comments, 'draft', true).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('excludes resolved when includeResolved is false', () => {
    expect(filterDocComments(comments, 'draft', false).map((c) => c.id)).toEqual(['a']);
  });

  it('returns empty for a doc with no comments', () => {
    expect(filterDocComments(comments, 'missing', true)).toEqual([]);
  });
});

describe('openCommentCount', () => {
  it('counts only unresolved comments of the doc', () => {
    expect(openCommentCount(comments, 'draft')).toBe(1);
    expect(openCommentCount(comments, 'other')).toBe(1);
    expect(openCommentCount(comments, 'missing')).toBe(0);
  });
});
