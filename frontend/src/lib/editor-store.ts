/**
 * Zustand store for the local-first document editor.
 *
 * Persists documents to localStorage via the `persist` middleware. Each
 * document is stored as a TipTap JSON object so it can be loaded back into
 * an editor without any serialisation round-trip.
 *
 * Invariants:
 * - `documents` is a Record keyed by document id (`docId`). This keeps
 *   look-ups O(1) and serialisation straightforward.
 * - `updatedAt` is set on every `saveDocument` call, enabling future
 *   "recently edited" lists without extra work.
 * - The store does NOT own the editor instance — that stays inside the
 *   component. The store is purely the persistence layer.
 *
 * --- WHERE TO CHANGE IF PERSISTENCE CHANGES ---
 * - Switch from localStorage to IndexedDB → replace `persist` with a
 *   custom storage adapter (see Zustand docs §custom-storage).
 * - Add server sync → add a `syncDocument(docId)` action that posts to
 *   `/api/v1/editor/documents/:docId`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JSONContent } from '@tiptap/react';

/** A single persisted document entry. */
export interface EditorDocument {
  /** Unique identifier — doubles as the URL segment (`:docId`). */
  id: string;
  /** Human-readable title, editable inline on the editor page. */
  title: string;
  /** TipTap JSON representation of the document body. */
  content: JSONContent;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

interface EditorState {
  /** All persisted documents, indexed by id. */
  documents: Record<string, EditorDocument>;

  /**
   * Upsert a document. Creates it if it does not exist yet; updates
   * `content`, `title`, and `updatedAt` if it does.
   */
  saveDocument(doc: Omit<EditorDocument, 'updatedAt'>): void;

  /** Return a document by id, or `undefined` if it has not been saved yet. */
  getDocument(id: string): EditorDocument | undefined;
}

/**
 * Initial TipTap JSON content for a brand-new draft document.
 *
 * A minimal paragraph node keeps the editor ready for input without
 * showing a blank white box.
 */
const EMPTY_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/** The default document id used when the route carries no `:docId`. */
export const DEFAULT_DOC_ID = 'draft';

/** Construct a fresh document stub for `id` with empty content. */
export function makeDefaultDocument(id: string): EditorDocument {
  return {
    id,
    title: id === DEFAULT_DOC_ID ? 'Draft' : `Document ${id}`,
    content: EMPTY_CONTENT,
    updatedAt: new Date().toISOString(),
  };
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      documents: {},

      saveDocument: (doc) =>
        set((state) => ({
          documents: {
            ...state.documents,
            [doc.id]: {
              ...doc,
              updatedAt: new Date().toISOString(),
            },
          },
        })),

      getDocument: (id) => get().documents[id],
    }),
    {
      name: 'lexflow.editor',
      // Persist all documents — the store is the source of truth.
      partialize: (s) => ({ documents: s.documents }),
    }
  )
);
