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
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditorStore, DEFAULT_DOC_ID, makeDefaultDocument } from '@/lib/editor-store';
import { EditorToolbar } from '@/pages/editor/EditorToolbar';
import { CitationPicker } from '@/pages/editor/CitationPicker';
import { TemplatesDialog } from '@/pages/editor/TemplatesDialog';
import { AiDraftPanel } from '@/pages/editor/AiDraftPanel';
import { CommentsPanel } from '@/pages/editor/CommentsPanel';
import { ExportMenu } from '@/pages/editor/ExportMenu';
import { LegalCitation } from '@/pages/editor/extensions/LegalCitation';
import { CommentMark } from '@/pages/editor/extensions/CommentMark';
import { useCommentStore } from '@/lib/comment-store';
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

  // Whether the corpus citation picker is open (#599).
  const [citationPickerOpen, setCitationPickerOpen] = useState<boolean>(false);

  // Whether the template library is open (#600).
  const [templatesOpen, setTemplatesOpen] = useState<boolean>(false);

  // Whether the AI drafting assistant panel is open (#601).
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(false);

  // Comments side panel (#602): open state + the comment to autofocus on open.
  const [commentsOpen, setCommentsOpen] = useState<boolean>(false);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const addComment = useCommentStore((s) => s.addComment);

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
      // Typed, corpus-resolved legal citations (#599). Inserted via CitationPicker.
      LegalCitation,
      // Inline comment anchors (#602). The note text lives in comment-store.
      CommentMark,
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

  /**
   * Comment the current selection (#602): snapshot the quote, anchor a
   * `comment` mark over it, store the (empty) note, then open the panel
   * focused on the new comment so the user types the note straight away.
   */
  const handleAddComment = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const quote = editor.state.doc.textBetween(from, to, ' ');
    const commentId = crypto.randomUUID();
    editor.chain().focus().setComment({ commentId, resolved: false }).run();
    addComment({ id: commentId, docId, quote, note: '' });
    setFocusCommentId(commentId);
    setCommentsOpen(true);
  }, [editor, docId, addComment]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      {/* Page header: editable title + doc id breadcrumb, export on the right */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
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
        </div>
        {editor && <ExportMenu editor={editor} title={title} />}
      </header>

      {/* Toolbar (disabled in read-only but the toggle button stays live) */}
      {editor && (
        <EditorToolbar
          editor={editor}
          isReadOnly={isReadOnly}
          onToggleReadOnly={handleToggleReadOnly}
          onInsertCitation={() => setCitationPickerOpen(true)}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenAiPanel={() => setAiPanelOpen(true)}
          onAddComment={handleAddComment}
          onOpenComments={() => {
            setFocusCommentId(null);
            setCommentsOpen(true);
          }}
        />
      )}

      {/* Corpus citation picker (#599) — portaled to <body> so the fixed overlay
          isn't clipped/anchored by this page's `overflow-auto` scroll container. */}
      {editor &&
        citationPickerOpen &&
        createPortal(
          <CitationPicker editor={editor} onClose={() => setCitationPickerOpen(false)} />,
          document.body,
        )}

      {/* Template library (#600) — portaled to <body> for the same reason. */}
      {editor &&
        templatesOpen &&
        createPortal(
          <TemplatesDialog editor={editor} onClose={() => setTemplatesOpen(false)} />,
          document.body,
        )}

      {/* AI drafting assistant (#601) — right-docked drawer, portaled to <body>. */}
      {editor &&
        aiPanelOpen &&
        createPortal(
          <AiDraftPanel editor={editor} onClose={() => setAiPanelOpen(false)} />,
          document.body,
        )}

      {/* Comments / annotations (#602) — right-docked drawer, portaled to <body>. */}
      {editor &&
        commentsOpen &&
        createPortal(
          <CommentsPanel
            editor={editor}
            docId={docId}
            focusCommentId={focusCommentId}
            onClose={() => setCommentsOpen(false)}
          />,
          document.body,
        )}

      {/* TipTap content area */}
      <div
        className={cn(
          'min-h-[60vh] rounded-lg border border-border bg-surface p-6',
          'prose prose-neutral dark:prose-invert max-w-none',
          // Headings inherit the app's display font + tight tracking instead
          // of the plugin's default body font — matches every other heading
          // in the app (`font-display ... tracking-tight`). Sizes/weights per
          // level stay the plugin's own — that per-level cascade IS the
          // "real heading hierarchy" a TipTap H1/H2/H3 was missing.
          'prose-headings:font-display prose-headings:tracking-tight',
          // Brand-aligned link color instead of the plugin's default gray/purple.
          'prose-a:text-indigo-600 dark:prose-a:text-indigo-300',
          // The plugin wraps inline code in literal backtick glyphs by default
          // (`code::before/after { content: "`" }`) — wrong for a legal
          // document, where inline code is rare and shouldn't look decorated.
          'prose-code:before:content-none prose-code:after:content-none',
          // Legal-document typography: slightly wider prose column, comfortable line-height.
          '[&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:outline-none',
          // Blockquote — styled as a legal citation block. The plugin also
          // injects decorative quote-mark glyphs on blockquote::before/after
          // by default; killed below so the citation block doesn't look like
          // a pull-quote.
          '[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-indigo-400',
          '[&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted',
          '[&_.ProseMirror_blockquote]:before:content-none [&_.ProseMirror_blockquote]:after:content-none',
          // Placeholder text when the editor is empty.
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
          // Inline comment highlight (#602): amber span; resolved → dotted underline only.
          '[&_.ProseMirror_.lex-comment]:rounded-sm [&_.ProseMirror_.lex-comment]:bg-[hsl(var(--amber-500)/0.28)]',
          '[&_.ProseMirror_.lex-comment]:box-decoration-clone [&_.ProseMirror_.lex-comment]:px-0.5',
          '[&_.ProseMirror_.lex-comment--resolved]:bg-transparent [&_.ProseMirror_.lex-comment--resolved]:px-0',
          '[&_.ProseMirror_.lex-comment--resolved]:underline [&_.ProseMirror_.lex-comment--resolved]:decoration-dotted',
          '[&_.ProseMirror_.lex-comment--resolved]:decoration-amber-400/70',
          isReadOnly && 'cursor-default',
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
