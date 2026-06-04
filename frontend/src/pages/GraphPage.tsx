import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Minus, Filter, Download, Pin, X } from 'lucide-react';
import { Badge, Button, Chip, Input } from '@/components/ui';
import { GraphCanvas, NODE_KIND_LABELS } from '@/components/domain/GraphCanvas';
import { EmptyState } from '@/components/domain/EmptyState';
import { ErrorState } from '@/components/domain/ErrorState';
import { SkeletonCanvas } from '@/components/domain/Skeleton';
import { RightRail } from '@/components/shell/RightRail';
import { useGraph, useGraphTop, useWarmup } from '@/lib/queries';
import { GRAPH_KIND_FILL } from '@/lib/graph-colors';
import type { GraphNodeKind } from '@/lib/types';

const ALL_KINDS: GraphNodeKind[] = ['law', 'article', 'reference', 'amendment', 'repealed'];

// Fallback seed when the live `/graph/top` call isn't available (mock
// mode without a seeded mock, transient network failure, empty corpus).
// "BOE-A-1978-31229" is the Constitución Española de 1978 — guaranteed
// to be in any legalize-es checkout.
const FALLBACK_SEED_LAW_ID = 'BOE-A-1978-31229';

export function GraphPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Set<GraphNodeKind>>(new Set(ALL_KINDS));
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

  const node = selected ? graph.nodes.find((n) => n.id === selected) : null;
  const neighbours = selected ? graph.edges.filter((e) => e.source === selected || e.target === selected).slice(0, 12) : [];

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-bg p-4">
          <Input icon={<Search className="size-3.5" />} placeholder={t('graph.searchPlaceholder')} className="w-72" />
          <span className="h-6 w-px bg-border" />
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
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" icon={<Filter className="size-3.5" />}>{t('graph.advancedFilters')}</Button>
            <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>PNG</Button>
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden bg-bg">
          <GraphCanvas data={graph} visibleKinds={filters} selected={selected} onSelect={setSelected} />

          {/* Legend — frosted glass overlay (Opera Air language) */}
          <div className="air-glass absolute bottom-4 left-4 px-3.5 py-2.5">
            <div className="label-caps mb-2">{t('graph.legend')}</div>
            <div className="flex flex-col gap-1.5 text-[12px]">
              {ALL_KINDS.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: GRAPH_KIND_FILL[t] }} />
                  {NODE_KIND_LABELS[t]}
                </div>
              ))}
            </div>
          </div>

          {/* Zoom — same glass shell as the legend so they read as a pair */}
          <div className="air-glass absolute bottom-4 right-4 flex flex-col gap-1 p-1">
            <Button size="icon" variant="ghost" aria-label={t('graph.zoomIn')} icon={<Plus className="size-3.5" />} />
            <Button size="icon" variant="ghost" aria-label={t('graph.zoomOut')} icon={<Minus className="size-3.5" />} />
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
                <Button size="icon-sm" variant="ghost" aria-label={t('graph.pin')} icon={<Pin className="size-3.5" />} />
                <Button size="icon-sm" variant="ghost" aria-label={t('graph.close')} onClick={() => setSelected(null)} icon={<X className="size-3.5" />} />
              </span>
            </div>
            <h2 className="font-display text-xl font-semibold">{node.label}</h2>
            <p className="mt-1.5 text-[13px] text-muted">{t(`graph.kindDesc.${node.kind}`)}</p>

            <div className="label-caps mb-2 mt-4">{t('graph.connections')}</div>
            <div className="flex flex-wrap gap-1.5">
              {neighbours.map((e) => {
                const other = e.source === node.id ? e.target : e.source;
                const o = graph.nodes.find((n) => n.id === other);
                if (!o) return null;
                return <Chip key={e.id} onClick={() => setSelected(other)}>{o.label}</Chip>;
              })}
            </div>

            <Button
              className="mt-5 w-full"
              onClick={() => selected && navigate(`/laws/${selected}`)}
              disabled={!selected}
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
