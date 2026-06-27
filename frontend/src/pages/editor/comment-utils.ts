/**
 * Pure helpers for inline document comments (#602).
 *
 * Kept free of React/TipTap so the selection/filtering logic is unit-testable
 * without an editor. The DOM-anchor lookup (`findCommentRange`) lives in the
 * panel since it needs a live editor instance.
 */
import type { DocComment } from '@/lib/comment-store';

/**
 * Comments for one document, oldest first.
 *
 * `includeResolved` controls whether resolved comments are kept — the panel
 * shows them in a separate, muted section; counts/badges use `false`.
 */
export function filterDocComments(
  comments: Record<string, DocComment>,
  docId: string,
  includeResolved: boolean,
): DocComment[] {
  const forDoc = Object.values(comments).filter((c) => c.docId === docId && (includeResolved || !c.resolved));
  return forDoc.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Count of open (unresolved) comments for a document — drives the toolbar badge. */
export function openCommentCount(comments: Record<string, DocComment>, docId: string): number {
  return filterDocComments(comments, docId, false).length;
}
