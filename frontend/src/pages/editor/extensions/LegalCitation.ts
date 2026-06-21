/**
 * `legalCitation` — a typed, corpus-resolved legal citation node (#599).
 *
 * Unlike a plain blockquote, this is a structured inline atom: it carries the
 * resolved `lawId` / `articleNum` of a real corpus entry, so it renders as a
 * clickable chip that navigates to `/laws/:lawId`. The structured attributes
 * also survive autosave (TipTap JSON) and HTML export (`getHTML()`), which the
 * template / export sprints (#600+) build on.
 *
 * Resolution happens at insert time in `CitationPicker` via `citationFromHit`
 * — this extension only stores + renders the result. The React chip view lives
 * in `./CitationChip` (kept separate for Fast Refresh).
 *
 * --- WHERE TO CHANGE IF CITATION BEHAVIOUR CHANGES ---
 * - New stored field → add it to `addAttributes` (with its `data-*` mapping)
 *   and to `CitationAttrs` in `../citation-utils.ts`.
 * - Chip look / click behaviour → `./CitationChip`.
 */
import { Node, mergeAttributes, ReactNodeViewRenderer } from '@tiptap/react';
import type { CitationAttrs } from '../citation-utils';
import { CitationChip } from './CitationChip';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    legalCitation: {
      /** Insert a resolved legal citation at the current selection. */
      insertLegalCitation: (attrs: CitationAttrs) => ReturnType;
    };
  }
}

/** Map a stored attribute to a `data-*` HTML attribute (omitted when empty). */
function dataAttr(name: string, value: unknown): Record<string, string> {
  return value ? { [name]: String(value) } : {};
}

export const LegalCitation = Node.create({
  name: 'legalCitation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      lawId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-law-id'),
        renderHTML: (attrs) => dataAttr('data-law-id', attrs.lawId),
      },
      articleNum: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-article-num'),
        renderHTML: (attrs) => dataAttr('data-article-num', attrs.articleNum),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') ?? el.textContent ?? '',
        renderHTML: (attrs) => dataAttr('data-label', attrs.label),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-legal-citation]' }];
  },

  // Text content = label so a plain-HTML export (#600+) still reads as a citation.
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-legal-citation': '' }), node.attrs.label || ''];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationChip);
  },

  addCommands() {
    return {
      insertLegalCitation:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs })
            // Trailing space so the cursor escapes the atom and typing continues.
            .insertContent(' ')
            .run(),
    };
  },
});
