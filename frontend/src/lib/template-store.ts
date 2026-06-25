/**
 * Zustand store for the local-first document-template library (#600).
 *
 * A template is just a saved TipTap document (JSON) whose text may contain
 * `{{variable}}` placeholders. Applying a template fills those placeholders
 * (from free-text input or corpus metadata) and inserts the result into the
 * editor. Persisted to localStorage so the library survives reloads.
 *
 * Invariants:
 * - `templates` is keyed by id for O(1) lookup + simple serialisation.
 * - The store is pure persistence — it never owns the editor instance, mirrors
 *   `editor-store.ts`.
 *
 * --- WHERE TO CHANGE IF PERSISTENCE CHANGES ---
 * - Server sync → add a `syncTemplate(id)` action posting to
 *   `/api/v1/editor/templates/:id` (same shape as the editor store note).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JSONContent } from '@tiptap/react';

/** A saved document template. */
export interface DocumentTemplate {
  /** Unique id (generated with `crypto.randomUUID()` on save). */
  id: string;
  /** Human-readable name shown in the library. */
  name: string;
  /** TipTap JSON body, may contain `{{variable}}` placeholders. */
  content: JSONContent;
  /** ISO timestamp of creation / last overwrite. */
  createdAt: string;
}

interface TemplateState {
  /** All saved templates, indexed by id. */
  templates: Record<string, DocumentTemplate>;

  /** Upsert a template (creates if new, overwrites `name`/`content` if it exists). */
  saveTemplate(template: Omit<DocumentTemplate, 'createdAt'>): void;

  /** Remove a template by id. */
  deleteTemplate(id: string): void;

  /** Return a template by id, or `undefined`. */
  getTemplate(id: string): DocumentTemplate | undefined;
}

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      templates: {},

      saveTemplate: (template) =>
        set((state) => ({
          templates: {
            ...state.templates,
            [template.id]: { ...template, createdAt: new Date().toISOString() },
          },
        })),

      deleteTemplate: (id) =>
        set((state) => {
          const next = { ...state.templates };
          delete next[id];
          return { templates: next };
        }),

      getTemplate: (id) => get().templates[id],
    }),
    {
      name: 'lexflow.templates',
      partialize: (s) => ({ templates: s.templates }),
    },
  ),
);
