/**
 * CitationChip — the React NodeView for the `legalCitation` node (#599).
 *
 * Rendered inline inside the editor for every citation. Clicking it opens the
 * cited law in the SPA. Kept in its own module so the node definition
 * (`LegalCitation.ts`) stays component-free (React Fast Refresh requirement).
 */
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * `contentEditable={false}` keeps ProseMirror from treating the chip internals
 * as editable text, so the click handler fires cleanly.
 */
export function CitationChip({ node }: NodeViewProps) {
  const navigate = useNavigate();
  const lawId = node.attrs.lawId as string | null;
  const label = (node.attrs.label as string) || lawId || 'Cita';

  const goToSource = () => {
    if (!lawId) return;
    // ponytail: navigate on click in any mode — the draft is autosaved, so
    // jumping to the source can't lose work. In-place re-pick deferred (#599).
    navigate(`/laws/${encodeURIComponent(lawId)}`);
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <button
        type="button"
        data-legal-citation=""
        contentEditable={false}
        onClick={goToSource}
        title={`${label} — abrir ley`}
        className={cn(
          'mx-0.5 inline-flex max-w-[22rem] items-center gap-1 rounded align-baseline',
          'bg-primary-soft px-1.5 py-0.5 text-[0.85em] font-medium leading-snug',
          'text-indigo-700 dark:text-indigo-200',
          'ring-1 ring-inset ring-indigo-300/50 dark:ring-indigo-400/30',
          'transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-500/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
        )}
      >
        <Scale className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
    </NodeViewWrapper>
  );
}
