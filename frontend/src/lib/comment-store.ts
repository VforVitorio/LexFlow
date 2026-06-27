/**
 * Zustand store for inline document comments / annotations (#602).
 *
 * A comment anchors a note to a span of editor text. The anchor itself lives in
 * the TipTap document as a `comment` mark carrying the same `id` (`commentId`);
 * this store holds the note metadata. Persisted to localStorage so annotations
 * survive reloads, keyed by `id` for O(1) lookup. Mirrors `editor-store.ts` /
 * `template-store.ts` — pure persistence, never owns the editor.
 *
 * --- WHERE TO CHANGE IF ANNOTATIONS GROW ---
 * - Law-detail margin notes (#602 v2) → reuse `DocComment` with a `docId` like
 *   `law:CE-1978` and the same store; the anchor model differs (article tree).
 * - Server sync / per-user → add a `syncComment(id)` action.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** A single anchored annotation. */
export interface DocComment {
  /** Unique id — also the `commentId` on the TipTap mark. */
  id: string;
  /** Document this comment belongs to (the editor `docId`). */
  docId: string;
  /** Snapshot of the annotated text, shown in the panel for context. */
  quote: string;
  /** The user's note. */
  note: string;
  /** ISO creation timestamp. */
  createdAt: string;
  /** Whether the comment has been resolved. */
  resolved: boolean;
}

interface CommentState {
  comments: Record<string, DocComment>;
  /** Create a comment (note usually filled in afterwards via the panel). */
  addComment(comment: Omit<DocComment, 'createdAt' | 'resolved'>): void;
  /** Update a comment's note text. */
  updateNote(id: string, note: string): void;
  /** Flip the resolved flag. */
  toggleResolved(id: string): void;
  /** Remove a comment entirely. */
  deleteComment(id: string): void;
}

export const useCommentStore = create<CommentState>()(
  persist(
    (set) => ({
      comments: {},

      addComment: (comment) =>
        set((state) => ({
          comments: {
            ...state.comments,
            [comment.id]: { ...comment, createdAt: new Date().toISOString(), resolved: false },
          },
        })),

      updateNote: (id, note) =>
        set((state) => {
          const existing = state.comments[id];
          if (!existing) return state;
          return { comments: { ...state.comments, [id]: { ...existing, note } } };
        }),

      toggleResolved: (id) =>
        set((state) => {
          const existing = state.comments[id];
          if (!existing) return state;
          return { comments: { ...state.comments, [id]: { ...existing, resolved: !existing.resolved } } };
        }),

      deleteComment: (id) =>
        set((state) => {
          const next = { ...state.comments };
          delete next[id];
          return { comments: next };
        }),
    }),
    {
      name: 'lexflow.comments',
      partialize: (s) => ({ comments: s.comments }),
    },
  ),
);
