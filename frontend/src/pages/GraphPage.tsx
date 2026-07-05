import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Minus, Filter, Download, Pin, X, Maximize2 } from 'lucide-react';
import { Badge, Button, Chip, Input } from '@/components/ui';
import { GraphCanvasLazy } from '@/components/domain/GraphCanvasLazy';
import type { GraphCanvasHandle } from '@/components/domain/GraphCanvas';
import { EmptyState } from '@/components/domain/EmptyState';
import { ErrorState } from '@/components/domain/ErrorState';
import { SkeletonCanvas } from '@/components/domain/Skeleton';
import { RightRail } from '@/components/shell/RightRail';
import { useGraph, useGraphTop, useWarmup } from '@/lib/queries';
import { EDGE_KIND_LABELS, GRAPH_EDGE_STROKE, GRAPH_KIND_FILL, NODE_KIND_LABELS, type GraphEdgeKind } from '@/lib/graph-colors';
import type { GraphNodeKind } from '@/lib/types';
import { buildNodeIndex, resolveNeighbourNodes } from './graph/neighbour-utils';
import { cn } from '@/lib/utils';

const ALL_KINDS: GraphNodeKind[] = ['law', 'article', 'reference', 'amendment', 'repealed'];
const ALL_EDGE_KINDS: GraphEdgeKind[] = ['cites', 'develops', 'modifies', 'repeals'];

// Fallback seed when the live `/graph/top` call isn't available (mock
// mode without a seeded mock, transient network failure, empty corpus).
// "BOE-A-1978-31229" is the Constitución Española de 1978 — guaranteed
// to be in any legalize-es checkout.
const FALLBACK_SEED_LAW_ID = 'BOE-A-1978-31229';

export function GraphPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Set<GraphNodeKind>>(new Set(ALL_KINDS));
  const graphRef = useRef<GraphCanvasHandle>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  // #221 — pick the seed dynamically. Hardcoding "CE-1978" 404'd because
  // the real ID is "BOE-A-1978-31229"; using the top-PageRank law also
  // keeps us honest as the corpus evolves. We pull the top 10 so the
  // error-state fallback can offer those as clickable alternatives
  // when the chosen seed isn't in the graph (corpus drift, manual URL).
  const { data: topLaws } = useGraphTop({ limit: 10 });
  // When the user picks an alternative from the empty-state fallback we
  // override the derived seed via `manualSeed`. Persisted only in
  // component state — a remount resets to the top-PageRank default.
  const [manualSeed, setManualSeed] = useState<string | null>(null);
  const seedLawId = manualSeed ?? topLaws?.[0]?.lawId ?? FALLBACK_SEED_LAW_ID;
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    // Initialise the right-rail selection to the seed once it resolves.
    // User clicks afterwards own the selection state.
    if (selected === null && seedLawId) setSelected(seedLawId);
  }, [seedLawId, selected]);
  const { data: graph, error, refetch, isLoading } = useGraph(seedLawId);

  // Functional update + ``useCallback`` so the chip row doesn't re-create
  // every onClick handler on each render. Declared BEFORE the early
  // returns below so the hook is called unconditionally (rules-of-hooks).
  const toggle = useCallback((t: GraphNodeKind) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const { data: warmup } = useWarmup();

  // Audit #409 perf: the right-rail used to do O(N) `.find()` per
  // neighbour to resolve each label, and the warmup poll re-ran the
  // chain every 2 s. Build a stable id → node Map once per graph and
  // memoise the resolved neighbours on the (edges, selected) tuple.
  // Declared BEFORE the early returns below so the hooks are called
  // unconditionally (rules-of-hooks). ``graph`` may be undefined while
  // loading; the optional chain keeps the memo deps stable.
  const nodeById = useMemo(() => buildNodeIndex(graph?.nodes ?? []), [graph?.nodes]);
  const neighbours = useMemo(
    () => resolveNeighbourNodes(graph?.edges ?? [], nodeById, selected),
    [graph?.edges, nodeById, selected],
  );
  const node = selected ? nodeById.get(selected) ?? null : null;

  if (error) {
    // Most common cause when this fires post-warmup: the chosen seed
    // isn't in the graph (the URL pointed at a derogated law, the
    // submodule rolled forward and the law moved/dropped, the cached
    // top-laws response is stale). Offer the live top-PageRank laws as
    // clickable alternatives so the user has a one-click escape instead
    // of just a retry button. Falls back to ErrorState when we don't
    // even have a top-laws list to suggest.
    const suggestions = topLaws ?? [];
    if (suggestions.length === 0) {
      return <div className="p-10"><ErrorState onRetry={() => refetch()} description={String(error)} /></div>;
    }
    return (
      <div className="p-10">
        <EmptyState
          title={t('graph.error.title')}
          description={
            <>
              <span className="block">{t('graph.error.seedMissing', { seed: seedLawId })}</span>
              <span className="mt-1 block">{t('graph.error.trySuggestions')}</span>
            </>
          }
          primaryAction={{ label: t('graph.retry'), onClick: () => refetch() }}
        />
        <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
          {suggestions.map((law) => (
            <button
              key={law.lawId}
              type="button"
              onClick={() => setManualSeed(law.lawId)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] hover:border-indigo-500/60 hover:bg-primary-soft/40"
            >
              <span className="font-mono text-[11px] text-muted">{law.lawId}</span>
              {law.title && <span className="max-w-[18ch] truncate">{law.title}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (!graph || isLoading) {
    // If warm-up explicitly tells us the graph isn't ready yet, surface
    // a concrete hint instead of the generic spinner — the user knows
    // why it's slow ("primera vez") and roughly how long it'll take.
    const hint = warmup && !warmup.graphReady
      ? t('graph.buildingFirstTime')
      : t('graph.loading');
    return (
      <div className="h-full p-6">
        <SkeletonCanvas hint={hint} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 overflow-x-auto border-b border-border bg-bg px-4 py-2.5 md:flex-wrap md:overflow-visible">
          {/* Deslop sprint #798 — no `value`/`onChange` wired yet (part of a
              deeper graph-search epic). Disabled + "próximamente" so it
              doesn't read as a broken search box. Hidden on mobile (#830) —
              the compact toolbar keeps only the kind chips as a swipe row. */}
          <span title={t('chat.comingSoon')} className="hidden cursor-not-allowed [&_input]:pointer-events-none md:inline-flex">
            <Input
              icon={<Search className="size-3.5" />}
              placeholder={t('graph.searchPlaceholder')}
              aria-label={t('graph.searchPlaceholder')}
              className="w-72 opacity-50"
              disabled
            />
          </span>
          <span className="hidden h-6 w-px bg-border md:block" />
          {ALL_KINDS.map((t) => (
            <Chip
              key={t}
              active={filters.has(t)}
              onClick={() => toggle(t)}
              icon={<span className="size-2 rounded-full" style={{ background: GRAPH_KIND_FILL[t] }} />}
            >
              {NODE_KIND_LABELS[t]}
            </Chip>
          ))}
          {/* Deslop sprint #798 — advanced filters + PNG export aren't
              wired yet; honest-disable. Hidden on mobile (#830) to keep the
              toolbar to a single compact row. */}
          <span className="ml-auto hidden gap-2 md:flex">
            <Button size="sm" variant="ghost" icon={<Filter className="size-3.5" />} disabled title={t('chat.comingSoon')}>{t('graph.advancedFilters')}</Button>
            <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} disabled title={t('chat.comingSoon')}>PNG</Button>
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden bg-bg">
          <GraphCanvasLazy ref={graphRef} data={graph} visibleKinds={filters} selected={selected} onSelect={setSelected} />

          {/* Legend (#830) — EDGES ONLY. The node-kind colours already live in
              the toolbar chips above, so repeating them here doubled the panel
              and covered nodes. Collapsed to a chip on mobile so it never sits
              on top of the graph; expanded inline on desktop. */}
          <div className="absolute bottom-4 left-4">
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              className={cn('air-glass label-caps px-3 py-2 md:hidden', legendOpen && 'hidden')}
            >
              {t('graph.legend')}
            </button>
            <div className={cn('air-glass px-3.5 py-2.5', !legendOpen && 'hidden md:block')}>
              <div className="label-caps mb-2 flex items-center justify-between gap-4">
                <span>{t('graph.edges')}</span>
                <button
                  type="button"
                  onClick={() => setLegendOpen(false)}
                  aria-label={t('graph.close')}
                  className="-mr-1 rounded p-0.5 text-muted hover:text-fg md:hidden"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5 text-[12px]">
                {ALL_EDGE_KINDS.map((kind) => (
                  <div key={kind} className="flex items-center gap-2">
                    <span
                      className="block h-px w-5"
                      style={{ background: GRAPH_EDGE_STROKE[kind] }}
                      aria-hidden
                    />
                    {EDGE_KIND_LABELS[kind]}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Zoom + fit — wired to the GraphCanvas imperative handle (#830).
              `fit` re-enables the auto-fit-on-resize behaviour. */}
          <div className="air-glass absolute bottom-4 right-4 flex flex-col gap-1 p-1">
            <Button size="icon" variant="ghost" aria-label={t('graph.zoomIn')} icon={<Plus className="size-3.5" />} onClick={() => graphRef.current?.zoomIn()} />
            <Button size="icon" variant="ghost" aria-label={t('graph.zoomOut')} icon={<Minus className="size-3.5" />} onClick={() => graphRef.current?.zoomOut()} />
            <Button size="icon" variant="ghost" aria-label={t('graph.fit', 'Ajustar a la vista')} icon={<Maximize2 className="size-3.5" />} onClick={() => graphRef.current?.fit()} />
          </div>
        </div>
      </div>

      <RightRail>
        {node ? (
          <>
            <div className="mb-3.5 flex items-center gap-2">
              <Badge style={{ background: GRAPH_KIND_FILL[node.kind], color: 'white', border: 'transparent' }}>
                {NODE_KIND_LABELS[node.kind]}
              </Badge>
              <span className="ml-auto flex gap-1">
                {/* Deslop sprint #798 — "pin" isn't wired yet; honest-disable. */}
                <Button size="icon-sm" variant="ghost" aria-label={t('graph.pin')} icon={<Pin className="size-3.5" />} disabled title={t('chat.comingSoon')} />
                <Button size="icon-sm" variant="ghost" aria-label={t('graph.close')} onClick={() => setSelected(null)} icon={<X className="size-3.5" />} />
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold">{node.label}</h2>
            <p className="mt-1.5 text-[13px] text-muted">{t(`graph.kindDesc.${node.kind}`)}</p>

            <div className="label-caps mb-2 mt-4">{t('graph.connections')}</div>
            <div className="flex flex-col gap-1.5">
              {neighbours.map(({ edge: e, otherNode: o, otherId }) => (
                <Chip key={e.id} onClick={() => setSelected(otherId)} className="w-full justify-start text-left">
                  <span className="truncate">{o.label}</span>
                </Chip>
              ))}
            </div>

            {/* Audit #409: only law-kind nodes have a meaningful
                ``/laws/<id>`` target; article / reference / amendment
                ids would 404. Disable the button (and encode the id)
                until we can resolve a parent law from those kinds.
                The IDs from xyflow are URL-safe today but
                ``encodeURIComponent`` is the right defensive pattern
                if the corpus ever ships ids with reserved characters. */}
            <Button
              className="mt-5 w-full"
              onClick={() => selected && node?.kind === 'law' && navigate(`/laws/${encodeURIComponent(selected)}`)}
              disabled={!selected || node?.kind !== 'law'}
            >
              {t('graph.openLaw')}
            </Button>
          </>
        ) : (
          <div className="text-[13px] text-muted">
            {t('graph.selectNode')}
          </div>
        )}
      </RightRail>
    </div>
  );
}
