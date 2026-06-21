/**
 * CitationPicker — modal that resolves a legal citation against the corpus and
 * inserts it into the editor as a typed `legalCitation` node (#599).
 *
 * Reuses the same full-text search hook as the command palette (`useSearch`)
 * so a citation always points at a real law / article. Mounted only while open
 * (EditorPage owns the open/close state), so its hooks run from a clean slate
 * each time and the input can autofocus on mount.
 *
 * --- WHERE TO CHANGE IF SEARCH / INSERTION CHANGES ---
 * - Hit → node attributes mapping → `citationFromHit` in `./citation-utils`.
 * - The corpus query → `useSearch` in `@/lib/queries`.
 */
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { BookOpenText, FileText, Scale } from 'lucide-react';
import { Kbd } from '@/components/ui';
import { useSearch } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { HighlightedSnippet } from '@/components/domain/HighlightedSnippet';
import { citationFromHit } from './citation-utils';

interface CitationPickerProps {
  editor: Editor;
  onClose: () => void;
}

export function CitationPicker({ editor, onClose }: CitationPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const { data, isFetching } = useSearch(q);
  const hits = data?.hits ?? [];

  // Autofocus the input on mount.
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Reset the active row whenever the result set changes so Enter always
  // targets a valid row even after the list shortens (mirrors CommandPalette).
  useEffect(() => {
    setActive(0);
  }, [q]);

  const insert = (index: number) => {
    const hit = hits[index];
    if (!hit) return;
    const attrs = citationFromHit(hit);
    if (!attrs) return; // unresolvable hit (no lawId) — skip silently
    editor.chain().focus().insertLegalCitation(attrs).run();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(hits.length - 1, a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insert(active);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, active]);

  const showHint = q.trim().length < 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Insertar cita legal"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/35 backdrop-blur-[2px] animate-in"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="air-glass-strong w-[580px] max-w-[92vw] overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Scale className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar una ley o artículo para citar…"
            className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted"
          />
          <Kbd>esc</Kbd>
        </div>

        <div role="listbox" aria-label="Resultados" className="max-h-[420px] overflow-auto p-2 scrollbar-thin">
          {showHint && (
            <div className="px-6 py-10 text-center text-sm text-muted">
              Escribe al menos 2 caracteres para buscar en el corpus.
            </div>
          )}
          {!showHint && hits.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-muted">
              {isFetching ? 'Buscando…' : `Sin resultados para "${q}".`}
            </div>
          )}
          {hits.map((h, idx) => (
            <button
              key={h.id}
              role="option"
              aria-selected={active === idx}
              onMouseEnter={() => setActive(idx)}
              onClick={() => insert(idx)}
              className={cn(
                'flex w-full items-center gap-3 rounded px-2.5 py-2 text-left text-[13.5px] transition-colors',
                active === idx ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200' : 'text-fg hover:bg-surface-2',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded',
                  h.kind === 'law'
                    ? 'bg-primary-soft text-indigo-700'
                    : 'bg-amber-soft text-amber-700 dark:text-amber-300',
                )}
              >
                {h.kind === 'law' ? <BookOpenText className="size-3.5" /> : <FileText className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{h.title}</div>
                {h.snippet && (
                  <div className="truncate text-[12px] text-muted">
                    <HighlightedSnippet
                      text={h.snippet}
                      match={h.match}
                      prefix={h.articleNumber ? `Art. ${h.articleNumber} — ` : undefined}
                    />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3.5 border-t border-border px-4 py-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> insertar cita
          </span>
          <span className="ml-auto font-mono">{hits.length} resultados</span>
        </div>
      </div>
    </div>
  );
}
