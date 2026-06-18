/**
 * RelatedLaws — compact "Leyes relacionadas" section for the law-detail
 * right rail.
 *
 * Receives the subgraph already fetched by `useGraph(lawId)` and filters it
 * down to neighbour nodes whose `kind === 'law'`, excluding the current law
 * itself. Each item renders as a clickable chip that navigates to the
 * target law's detail page.
 *
 * Responsibilities:
 * - Filter: `kind === 'law'` && `id !== currentLawId`
 * - Cap: at most `MAX_RELATED` items (avoids flooding the right rail when
 *   a very central law has hundreds of law-neighbours)
 * - Empty state: a short muted message when no related laws exist
 * - Loading / unavailable: renders nothing (caller decides whether the
 *   graph is still loading)
 *
 * WHERE TO CHANGE IF X CHANGES:
 * - GraphNode fields → `src/lib/types.ts` `GraphNode` interface
 * - Navigation pattern for law detail → `LawDetailPage.tsx` (currently
 *   `/laws/${encodeURIComponent(id)}`)
 * - `useGraph` return shape → `src/lib/queries.ts` `useGraph`
 */
import { Network } from 'lucide-react';
import { Chip } from '@/components/ui';
import type { GraphData } from '@/lib/types';

/** Maximum number of related-law chips surfaced in the right rail. */
const MAX_RELATED = 10;

interface RelatedLawsProps {
  /** Subgraph centred on the current law. Pass `undefined` while loading. */
  graph: GraphData | undefined;
  /** The id of the law currently being viewed — excluded from the list. */
  currentLawId: string;
  /** Navigate to a law detail page. */
  onNavigate: (lawId: string) => void;
}

/**
 * Renders a labelled chip list of laws connected to `currentLawId` in the
 * knowledge graph. Returns `null` when the graph is unavailable.
 *
 * The section only appears when there is at least one related law so the
 * right rail never shows an orphan header.
 */
export function RelatedLaws({ graph, currentLawId, onNavigate }: RelatedLawsProps) {
  if (!graph) return null;

  const related = graph.nodes
    .filter((n) => n.kind === 'law' && n.id !== currentLawId)
    .slice(0, MAX_RELATED);

  if (related.length === 0) {
    return (
      <div className="mt-5">
        <div className="label-caps mb-2 flex items-center gap-1.5">
          <Network className="size-3 text-muted" aria-hidden />
          Leyes relacionadas
        </div>
        <p className="text-[12.5px] text-muted">Sin leyes relacionadas todavía.</p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="label-caps mb-2 flex items-center gap-1.5">
        <Network className="size-3 text-muted" aria-hidden />
        Leyes relacionadas
        <span className="ml-auto text-[11px] font-normal normal-case text-muted">
          {related.length}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {related.map((node) => (
          <Chip
            key={node.id}
            onClick={() => onNavigate(node.id)}
            className="w-full justify-start truncate text-left"
          >
            {node.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
