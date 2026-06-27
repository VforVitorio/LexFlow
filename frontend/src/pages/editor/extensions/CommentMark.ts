/**
 * `comment` — an inline mark anchoring a document comment to a text span (#602).
 *
 * The mark only carries the `commentId` (and a `resolved` flag for styling);
 * the note text lives in `comment-store`. Rendered as a `span[data-comment-id]`
 * so it round-trips to/from HTML and JSON; the highlight CSS is co-located in
 * `EditorPage.tsx` (`[data-comment-id]`).
 *
 * `inclusive: false` so typing immediately after a commented span does NOT
 * extend the comment over the new text.
 *
 * --- WHERE TO CHANGE IF COMMENT ANCHORING CHANGES ---
 * - Stored note/metadata → `@/lib/comment-store`.
 * - Highlight look → the `[data-comment-id]` rules in `EditorPage.tsx`.
 */
import { Mark, mergeAttributes } from '@tiptap/react';

export interface CommentMarkAttrs {
  commentId: string;
  resolved?: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** Apply (or update) the comment mark over the current selection. */
      setComment: (attrs: CommentMarkAttrs) => ReturnType;
      /** Remove the comment mark from the current selection. */
      unsetComment: () => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => (attrs.commentId ? { 'data-comment-id': attrs.commentId } : {}),
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-resolved') === 'true',
        renderHTML: (attrs) => (attrs.resolved ? { 'data-resolved': 'true' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  // A stable class (not the `data-*` attribute) drives the highlight CSS —
  // Tailwind arbitrary variants don't reliably compile a nested
  // `[data-comment-id]` attribute selector, so style `.lex-comment` instead.
  renderHTML({ HTMLAttributes, mark }) {
    // Resolved spans use ONLY the resolved class so the base amber-fill rule
    // doesn't also apply (equal-specificity classes would let fill win).
    const className = mark.attrs.resolved ? 'lex-comment--resolved' : 'lex-comment';
    return ['span', mergeAttributes(HTMLAttributes, { class: className }), 0];
  },

  addCommands() {
    return {
      setComment:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetComment:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
