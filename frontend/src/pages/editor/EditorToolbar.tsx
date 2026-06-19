/**
 * EditorToolbar — formatting controls for the TipTap-based document editor.
 *
 * Renders heading levels (H1/H2/H3), inline marks (bold, italic), list
 * types (bullet, ordered), a blockquote toggle for legal citations, and
 * undo/redo. A read/edit mode toggle is placed at the right end.
 *
 * Responsibilities:
 * - Reads active marks/nodes from the editor via `useEditorState` so
 *   active-state badges stay reactive without forcing a full component
 *   re-render on every keystroke.
 * - Calls TipTap `chain().focus().<command>().run()` for every action so
 *   focus never leaves the editor when the user clicks a toolbar button.
 * - Uses the shared `Button` primitive so spacing, radius, and focus rings
 *   match the rest of the SPA.
 *
 * --- WHERE TO CHANGE IF TOOLBAR ITEMS CHANGE ---
 * - New formatting action → add a button group entry in `BLOCK_ACTIONS` or
 *   `INLINE_ACTIONS` below and wire its `onPress` + `isActive` callbacks.
 * - New TipTap extension → install it, add to `EditorPage.tsx` extensions
 *   array, then add a button here.
 */
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Eye,
  Pencil,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface EditorToolbarProps {
  editor: Editor;
  isReadOnly: boolean;
  onToggleReadOnly: () => void;
}

/** A thin divider between button groups. */
function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * A single toolbar button. Uses `Button` variant `ghost` with an extra
 * active ring when the mark/node is currently applied.
 */
function ToolButton({ icon, label, active, disabled, onPress }: ToolButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onPress}
      className={cn(active && 'bg-primary-soft text-indigo-700 dark:text-indigo-200')}
    >
      {icon}
    </Button>
  );
}

/**
 * EditorToolbar renders formatting controls for the given `editor` instance.
 * The `isReadOnly` / `onToggleReadOnly` props control the edit/read toggle
 * button at the right of the bar — owned by EditorPage so the state lives
 * one level up (it also drives `editor.setEditable`).
 */
export function EditorToolbar({ editor, isReadOnly, onToggleReadOnly }: EditorToolbarProps) {
  // `useEditorState` subscribes to ProseMirror transactions and re-renders
  // only when the selected values change — cheaper than shouldRerenderOnTransaction.
  const editorState = useEditorState({
    editor,
    selector: (snap) => ({
      canUndo: snap.editor.can().undo(),
      canRedo: snap.editor.can().redo(),
      isH1: snap.editor.isActive('heading', { level: 1 }),
      isH2: snap.editor.isActive('heading', { level: 2 }),
      isH3: snap.editor.isActive('heading', { level: 3 }),
      isBold: snap.editor.isActive('bold'),
      isItalic: snap.editor.isActive('italic'),
      isBulletList: snap.editor.isActive('bulletList'),
      isOrderedList: snap.editor.isActive('orderedList'),
      isBlockquote: snap.editor.isActive('blockquote'),
    }),
  });

  const { canUndo, canRedo, isH1, isH2, isH3, isBold, isItalic, isBulletList, isOrderedList, isBlockquote } =
    editorState;

  return (
    <div
      role="toolbar"
      aria-label="Editor toolbar"
      className={cn(
        'flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-sm',
        isReadOnly && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Heading levels */}
      <ToolButton
        icon={<Heading1 className="size-3.5" />}
        label="Heading 1"
        active={isH1}
        onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolButton
        icon={<Heading2 className="size-3.5" />}
        label="Heading 2"
        active={isH2}
        onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        icon={<Heading3 className="size-3.5" />}
        label="Heading 3"
        active={isH3}
        onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <Divider />

      {/* Inline marks */}
      <ToolButton
        icon={<Bold className="size-3.5" />}
        label="Bold"
        active={isBold}
        onPress={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolButton
        icon={<Italic className="size-3.5" />}
        label="Italic"
        active={isItalic}
        onPress={() => editor.chain().focus().toggleItalic().run()}
      />

      <Divider />

      {/* Lists */}
      <ToolButton
        icon={<List className="size-3.5" />}
        label="Bullet list"
        active={isBulletList}
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolButton
        icon={<ListOrdered className="size-3.5" />}
        label="Ordered list"
        active={isOrderedList}
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <Divider />

      {/* Blockquote — used for legal citations */}
      <ToolButton
        icon={<Quote className="size-3.5" />}
        label="Blockquote (legal citation)"
        active={isBlockquote}
        onPress={() => editor.chain().focus().toggleBlockquote().run()}
      />

      <Divider />

      {/* Undo / Redo */}
      <ToolButton
        icon={<Undo2 className="size-3.5" />}
        label="Undo"
        disabled={!canUndo}
        onPress={() => editor.chain().focus().undo().run()}
      />
      <ToolButton
        icon={<Redo2 className="size-3.5" />}
        label="Redo"
        disabled={!canRedo}
        onPress={() => editor.chain().focus().redo().run()}
      />

      {/* Read / Edit toggle — not affected by isReadOnly dimming; always clickable */}
      <div className={cn('ml-auto', isReadOnly && 'pointer-events-auto opacity-100')}>
        <Button
          type="button"
          variant={isReadOnly ? 'secondary' : 'ghost'}
          size="sm"
          aria-label={isReadOnly ? 'Switch to edit mode' : 'Switch to read mode'}
          title={isReadOnly ? 'Switch to edit mode' : 'Switch to read mode'}
          icon={isReadOnly ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
          onClick={onToggleReadOnly}
        >
          {isReadOnly ? 'Edit' : 'Read'}
        </Button>
      </div>
    </div>
  );
}
