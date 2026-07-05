/**
 * ExportMenu — "Exportar" control for the editor header (#861).
 *
 * Opens a small menu to download the current document as Word (.docx) or
 * Markdown (.md). The app has no menu primitive (UI is hand-rolled), so this
 * is a minimal accessible dropdown: closes on Escape and outside-click, the
 * trigger carries `aria-haspopup`/`aria-expanded`, items are `role="menuitem"`.
 *
 * Export logic lives in `./export-utils` (pure serializers + download). DOCX
 * dynamic-imports `docx`, so opening this menu costs nothing until used.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, FileText, FileType2, ChevronDown } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui';
import { exportDocx, exportMarkdown } from './export-utils';

interface ExportMenuProps {
  editor: Editor;
  /** Document title — used as the download filename stem. */
  title: string;
}

export function ExportMenu({ editor, title }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape or a click outside the menu root.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  async function run(action: () => void | Promise<void>) {
    setOpen(false);
    try {
      await action();
    } catch (err) {
      // Export is a user action; a silent failure would look like a no-op.
      console.error('Document export failed', err);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={<Download className="size-4" />}
        iconRight={<ChevronDown className="size-3.5" />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Exportar
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Exportar documento"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border-strong bg-surface py-1 shadow-2"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => run(() => exportDocx(editor.getJSON(), title))}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2"
          >
            <FileType2 className="size-4 text-indigo-600 dark:text-indigo-300" />
            Word (.docx)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(() => exportMarkdown(editor.getJSON(), title))}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2"
          >
            <FileText className="size-4 text-muted" />
            Markdown (.md)
          </button>
        </div>
      )}
    </div>
  );
}
