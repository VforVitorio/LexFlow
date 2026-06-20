/**
 * EditorPage — document editor route (`/editor` and `/editor/:docId`).
 *
 * Provides a TipTap rich-text editor with:
 * - StarterKit (paragraph, headings, bold, italic, lists, blockquote,
 *   horizontal rule, code, undo/redo — all via a single extension).
 * - A floating toolbar (EditorToolbar) for the subset of controls
 *   exposed in the UI.
 * - Local-first persistence via `useEditorStore` (Zustand + localStorage).
 *   Content is autosaved ~600 ms after the last keystroke (debounced).
 * - A read/edit toggle that calls `editor.setEditable(boolean)`.
 * - An inline-editable title bound to the persisted document.
 *
 * Invariants:
 * - The editor is always mounted with `immediatelyRender: true` (CSR only).
 * - On unmount the debounce timer is cancelled via the cleanup returned
 *   from `useEffect` so a queued save never fires against an unmounted
 *   component.
 * - `docId` defaults to `DEFAULT_DOC_ID` (`'draft'`) when the route is
 *   visited without a `:docId` segment.
 *
 * --- WHERE TO CHANGE IF EDITOR FEATURES CHANGE ---
 * - Add a new TipTap extension → install it, add to `extensions` below,
 *   and add its toolbar button in `EditorToolbar.tsx`.
 * - Change the autosave delay → update `AUTOSAVE_DELAY_MS`.
 * - Switch from localStorage to server sync → update `useEditorStore`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditorStore, DEFAULT_DOC_ID, makeDefaultDocument } from '@/lib/editor-store';
import { EditorToolbar } from '@/pages/editor/EditorToolbar';
import { cn } from '@/lib/utils';

/** Debounce window before a content change is written to localStorage (ms). */
const AUTOSAVE_DELAY_MS = 600;

/**
 * EditorPage renders the document editor for the given `docId` route param.
 * When no `docId` is provided it falls back to `DEFAULT_DOC_ID` (`'draft'`).
 */
export function EditorPage() {
  const { docId = DEFAULT_DOC_ID } = useParams<{ docId?: string }>();

  const { getDocument, saveDocument } = useEditorStore();

  // Resolve the document from the store; create a default stub if new.
  const stored = getDocument(docId);
  const initialDoc = stored ?? makeDefaultDocument(docId);

  // Local title state — synced to the store on every change alongside content.
  const [title, setTitle] = useState<string>(initialDoc.title);

  // Whether the editor is in read-only (preview) mode.
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);

  // Ref to hold the active autosave timeout so it can be cancelled on unmount.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `useEditor`'s `onUpdate` closes over the values at creation time, so the
  // debounced save must read the CURRENT docId/title from refs — otherwise a
  // queued save can write content under a stale id or roll back a newer title
  // (#598 review).
  const docIdRef = useRef(docId);
  const titleRef = useRef(title);
  useEffect(() => {
    docIdRef.current = docId;
  }, [docId]);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const editor = useEditor({
    extensions: [
      // StarterKit includes: Document, Paragraph, Text, Bold, Italic,
      // Strike, Code, Heading (levels 1-6), BulletList, OrderedList,
      // ListItem, Blockquote, HorizontalRule, HardBreak, History (undo/redo),
      // Dropcursor, Gapcursor.
      StarterKit,
      // Empty-state hint. Sets `is-editor-empty` + `data-placeholder` on the
      // first empty paragraph; the CSS that renders it lives in the editor
      // container below (`is-editor-empty:first-child::before`).
      Placeholder.configure({ placeholder: 'Empieza a escribir tu documento…' }),
    ],
    content: initialDoc.content,
    editable: !isReadOnly,
    immediatelyRender: true,
    onUpdate: ({ editor: ed }) => {
      // Debounce: cancel the previous timer and start a fresh one.
      if (autosaveTimer.current !== null) {
        clearTimeout(autosaveTimer.current);
      }
      autosaveTimer.current = setTimeout(() => {
        saveDocument({
          id: docIdRef.current,
          title: titleRef.current,
          content: ed.getJSON(),
        });
      }, AUTOSAVE_DELAY_MS);
    },
  });

  // Cancel any pending autosave when the component unmounts.
  useEffect(() => {
    return () => {
      if (autosaveTimer.current !== null) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, []);

  // When `docId` changes (the user navigates to a different doc), load the
  // correct content and reset the title.
  useEffect(() => {
    if (!editor) return;
    // A queued autosave from the previous doc must not fire after the switch —
    // it would write the old content under the new id (#598 review).
    if (autosaveTimer.current !== null) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const doc = getDocument(docId) ?? makeDefaultDocument(docId);
    setTitle(doc.title);
    // `setContent` resets the editor state to the new JSON document.
    editor.commands.setContent(doc.content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Sync the `editable` flag whenever the toggle changes.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  /** Flush the title change to the store immediately (no debounce needed — titles are short). */
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      if (!editor) return;
      saveDocument({
        id: docId,
        title: newTitle,
        content: editor.getJSON(),
      });
    },
    [docId, editor, saveDocument]
  );

  const handleToggleReadOnly = useCallback(() => {
    setIsReadOnly((prev) => !prev);
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      {/* Page header: editable title + doc id breadcrumb */}
      <header className="flex flex-col gap-1">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          readOnly={isReadOnly}
          aria-label="Document title"
          placeholder="Untitled document"
          className={cn(
            'w-full bg-transparent text-2xl font-semibold tracking-tight text-fg outline-none',
            'placeholder:text-muted',
            'focus:outline-none',
            isReadOnly && 'cursor-default select-text',
          )}
        />
        <span className="text-xs text-muted">
          {docId !== DEFAULT_DOC_ID ? `ID: ${docId}` : 'Draft'}
          {stored?.updatedAt && (
            <>
              {' · '}
              Saved {new Date(stored.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </>
          )}
        </span>
      </header>

      {/* Toolbar (disabled in read-only but the toggle button stays live) */}
      {editor && (
        <EditorToolbar
          editor={editor}
          isReadOnly={isReadOnly}
          onToggleReadOnly={handleToggleReadOnly}
        />
      )}

      {/* TipTap content area */}
      <div
        className={cn(
          'min-h-[60vh] rounded-lg border border-border bg-surface p-6',
          'prose prose-neutral dark:prose-invert max-w-none',
          // Legal-document typography: slightly wider prose column, comfortable line-height.
          '[&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:outline-none',
          // Blockquote — styled as a legal citation block.
          '[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-indigo-400',
          '[&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted',
          // Placeholder text when the editor is empty.
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
          isReadOnly && 'cursor-default',
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
