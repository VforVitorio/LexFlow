import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, X, GitCompareArrows, ExternalLink } from 'lucide-react';
import { LawHeader } from '@/components/domain/LawHeader';
import { ArticleBlock } from '@/components/domain/ArticleBlock';
import { GraphCanvas } from '@/components/domain/GraphCanvas';
import { VersionTimeline } from '@/components/domain/VersionTimeline';
import { ErrorState } from '@/components/domain/ErrorState';
import { Skeleton, SkeletonLines } from '@/components/domain/Skeleton';
import { Badge, Button, Chip, Tabs } from '@/components/ui';
import { RightRail } from '@/components/shell/RightRail';
import { useGraph, useLaw, useVersions } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { formatDate } from '@/lib/utils';
import type { Article, ArticleRef, GraphNodeKind, LawDetail } from '@/lib/types';

const ALL_GRAPH_KINDS: GraphNodeKind[] = ['law', 'article', 'reference', 'amendment', 'repealed'];

type Tab = 'texto' | 'versiones' | 'grafo' | 'refs' | 'disc';

export function LawDetailPage() {
  const { lawId } = useParams<{ lawId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const readingSize = useUi((s) => s.readingSize);
  const [tab, setTab] = useState<Tab>('texto');
  const [selectedRef, setSelectedRef] = useState<ArticleRef | null>(null);

  const { data: law, isLoading, error, refetch } = useLaw(lawId);
  const { data: versions = [] } = useVersions(lawId);

  // Articles already arrive embedded in the law-detail response — no
  // need to fetch them a second time (the old `api.laws.references()`
  // shim re-fetched `/laws/{id}` for this, which transferred the body
  // twice). Empty array fallback keeps the rendering loop happy until
  // `useLaw` resolves. Memoised so the dependent `lawRefs` memo only
  // recomputes when the underlying array actually changes.
  const articles = useMemo<Article[]>(() => law?.articles ?? [], [law]);
  // Audit #469 — refs/grafo tabs used to show "tab pending" stubs even
  // though the backend has exposed both surfaces for sprints. Flatten
  // every outgoing reference from the embedded articles for the refs
  // tab; the grafo tab seeds `useGraph` with this law id and renders
  // the inline canvas. We compute both unconditionally so the page can
  // switch tabs without refetching.
  const lawRefs = useMemo<ArticleRef[]>(() => {
    const seen = new Set<string>();
    const out: ArticleRef[] = [];
    for (const article of articles) {
      for (const ref of article.refs ?? []) {
        const key = `${ref.label}|${ref.target?.lawId ?? ''}|${ref.target?.articleNum ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(ref);
      }
    }
    return out;
  }, [articles]);

  if (error) return <div className="p-10"><ErrorState description={String(error)} onRetry={() => refetch()} /></div>;
  if (!law || isLoading) return <LoadingSkeleton />;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <LawHeader
          law={law}
          versionsCount={versions.length}
          onTagClick={(t) => navigate(`/explorer?tags=${encodeURIComponent(t)}`)}
        />

        <div className="border-b border-border px-5 md:px-8">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'texto', label: t('lawDetail.tabs.texto'), count: law.articulos },
              // #592 — count the real version history (useVersions), not the
              // law-detail `versiones` field, which the backend leaves at 0
              // (the count needs git log, served by /laws/{id}/versions).
              { id: 'versiones', label: t('lawDetail.tabs.versiones'), count: versions.length },
              { id: 'grafo', label: t('lawDetail.tabs.grafo') },
              { id: 'refs', label: t('lawDetail.tabs.refs'), count: law.referencias },
              { id: 'disc', label: t('lawDetail.tabs.disc') },
            ]}
          />
        </div>

        {tab === 'texto' && <TextoTab articles={articles} readingSize={readingSize} onRefClick={setSelectedRef} />}
        {tab === 'versiones' && (
          <div className="flex-1 overflow-auto p-8 scrollbar-thin">
            <VersionTimeline versions={versions} current={versions[versions.length - 1]?.tag} />
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-base font-semibold">{t('lawDetail.changesByVersion')}</h3>
                <Button size="sm" variant="secondary" icon={<GitCompareArrows className="size-3.5" />}
                  onClick={() => navigate(`/laws/${encodeURIComponent(lawId ?? '')}/diff`)}>
                  {t('lawDetail.compareVersions')}
                </Button>
              </div>
              {[...versions].reverse().map((v, i) => (
                <div key={v.tag} className="mb-2.5 flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4">
                  <span className={`inline-flex size-9 items-center justify-center rounded-md ${v.kind === 'publish' ? 'bg-primary-soft text-indigo-700' : 'bg-amber-soft text-amber-700'}`}>
                    {v.kind === 'publish' ? <Plus className="size-4" /> : <GitCompareArrows className="size-4" />}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold">{v.tag}</span>
                      <span className="text-sm">{v.label}</span>
                      {i === 0 && <Badge tone="success">vigente</Badge>}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">{formatDate(v.date)}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/laws/${encodeURIComponent(lawId ?? '')}/diff`)}>{t('lawDetail.viewChanges')}</Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'grafo' && lawId && (
          <LawDetailGraphTab lawId={lawId} onOpenGlobalGraph={() => navigate('/graph')} />
        )}
        {tab === 'refs' && (
          <LawDetailRefsTab refs={lawRefs} onRefClick={setSelectedRef} />
        )}
        {tab === 'disc' && (
          <div className="flex-1 overflow-auto p-12 text-center text-muted">
            <p>{t('lawDetail.tabPending', { tab: t('lawDetail.tabs.disc') })}</p>
          </div>
        )}
      </div>

      <RightRail>
        <DetailRightRail
          law={law}
          selectedRef={selectedRef}
          onDismiss={() => setSelectedRef(null)}
          onNavigate={navigate}
        />
      </RightRail>
    </div>
  );
}

/**
 * Audit #469 — refs tab. Render every outgoing reference the law has,
 * grouped by source article when possible. Clicking a ref opens the
 * detail right-rail card via the parent's ``setSelectedRef``.
 */
function LawDetailRefsTab({ refs, onRefClick }: { refs: ArticleRef[]; onRefClick: (r: ArticleRef) => void }) {
  const { t } = useTranslation();
  if (refs.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-12 text-center text-muted">
        <p>{t('lawDetail.refsEmpty')}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8 scrollbar-thin">
      <div className="mb-3 label-caps">{t('lawDetail.refsHeading', { n: refs.length })}</div>
      <div className="flex flex-wrap gap-1.5">
        {refs.map((ref, i) => (
          <Chip key={`${ref.label}-${i}`} onClick={() => onRefClick(ref)}>{ref.label}</Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * Audit #469 — grafo tab. Embed the existing GraphCanvas seeded on the
 * current law so the user can explore the local neighbourhood without
 * leaving the page. ``Open global view`` still navigates to the full
 * ``/graph`` page for corpus-wide exploration.
 */
function LawDetailGraphTab({ lawId, onOpenGlobalGraph }: { lawId: string; onOpenGlobalGraph: () => void }) {
  const { t } = useTranslation();
  const visibleKinds = useMemo(() => new Set(ALL_GRAPH_KINDS), []);
  const [selected, setSelected] = useState<string | null>(lawId);
  const { data: graph, isLoading, error } = useGraph(lawId);
  if (error) {
    return (
      <div className="flex-1 overflow-auto p-12 text-center text-muted">
        <ErrorState description={String(error)} />
      </div>
    );
  }
  if (!graph || isLoading) {
    return <div className="flex-1 overflow-auto p-12 text-center text-muted">{t('graph.loading')}</div>;
  }
  return (
    <div className="relative flex-1 overflow-hidden bg-bg">
      <GraphCanvas data={graph} visibleKinds={visibleKinds} selected={selected} onSelect={setSelected} />
      <Button
        className="absolute top-3 right-3"
        size="sm"
        variant="secondary"
        onClick={onOpenGlobalGraph}
      >
        {t('lawDetail.openGlobalGraph')}
      </Button>
    </div>
  );
}

function TextoTab({ articles, readingSize, onRefClick }: { articles: Article[]; readingSize: number; onRefClick: (r: ArticleRef) => void }) {
  // Audit #409: the page used to render a hardcoded "Modificada por LO
  // 3/2018" callout AND a hardcoded "Título I · Capítulo II" heading
  // for every law. Both were copy from the CE-1978 mock and lied for
  // any other law. The real "modificada por" callout needs the diff
  // metadata wired through (issue #427 follow-up); the hierarchy
  // heading needs the section tree drilled in from ``law.sections``.
  // Until those land, dropping the lies is the right call.
  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="reading-col px-5 md:px-8 py-9">
        {articles.map((a) => (
          <ArticleBlock key={a.id} article={a} size={readingSize} onCitationClick={onRefClick} />
        ))}
      </div>
    </div>
  );
}

/**
 * Flattens every article's outgoing references into a deduped, capped
 * list for the "Referencias relacionadas" panel. Refs are deduped by
 * their display label (the same target can be cited from several
 * articles) and the first occurrence wins so the earliest article's
 * resolved target is preserved.
 *
 * WHERE TO CHANGE IF X CHANGES: references live on
 * ``law.articles[].refs`` (``ArticleRef[]``) — see `src/lib/types.ts`.
 */
function relatedRefsFor(articles: Article[]): ArticleRef[] {
  const seen = new Set<string>();
  const unique: ArticleRef[] = [];
  for (const article of articles) {
    for (const ref of article.refs) {
      if (seen.has(ref.label)) continue;
      seen.add(ref.label);
      unique.push(ref);
    }
  }
  return unique.slice(0, 4);
}

function DetailRightRail({
  law, selectedRef, onDismiss, onNavigate,
}: {
  law: LawDetail;
  selectedRef: ArticleRef | null;
  onDismiss: () => void;
  onNavigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  const relatedRefs = useMemo(() => relatedRefsFor(law.articles), [law.articles]);

  return (
    <>
      <div className="mb-3.5 flex items-center justify-between">
        <span className="label-caps">{selectedRef ? t('lawDetail.citationSelected') : t('lawDetail.lawInfo')}</span>
        {selectedRef && (
          <button onClick={onDismiss} className="text-muted hover:text-fg">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {selectedRef ? (
        // ``ArticleRef`` carries only a label + optional resolved target —
        // it has no snippet/date/article body to build a faithful
        // ``ChatSource`` for the CitationCard, so we surface the real ref
        // label and let the user jump to the target law instead of
        // fabricating a citation card (issue #480).
        <div className="space-y-3">
          <div>
            <h3 className="font-display text-base font-semibold">{selectedRef.label}</h3>
            <p className="mt-1 text-[12.5px] text-muted">{t('lawDetail.citedFrom', { law: law.short })}</p>
          </div>
          {selectedRef.target && (
            <button
              onClick={() => selectedRef.target && onNavigate(`/laws/${encodeURIComponent(selectedRef.target.lawId)}`)}
              className="flex items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-surface-2"
            >
              <ExternalLink className="size-3 text-muted" /> {selectedRef.label}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-muted">
            {t('lawDetail.selectCitation')}
          </p>
        </div>
      )}

      {relatedRefs.length > 0 && (
        <>
          <div className="label-caps mb-2 mt-5">{t('lawDetail.relatedRefs')}</div>
          <div className="flex flex-col gap-0.5">
            {relatedRefs.map((ref) => {
              const targetLawId = ref.target?.lawId;
              return (
                <button
                  key={ref.label}
                  disabled={!targetLawId}
                  onClick={() => targetLawId && onNavigate(`/laws/${encodeURIComponent(targetLawId)}`)}
                  className="flex items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <ExternalLink className="size-3 text-muted" /> {ref.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Mimics the actual reading-column shape so the layout doesn't shift
 * when the law arrives — header badges, title, subtitle, tab strip,
 * then two article blocks worth of paragraph skeletons. Reuses the
 * shared `<Skeleton>` family so dark/light + the future motion-reduce
 * variants stay consistent across pages.
 */
function LoadingSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy>
      {/* Header (matches LawHeader's height + badge strip) */}
      <div className="border-b border-border px-5 md:px-8 py-6">
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="mb-2 h-8 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      {/* Tab strip */}
      <div className="border-b border-border px-5 md:px-8">
        <div className="flex gap-6 py-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
      </div>

      {/* Reading column — two article blocks worth */}
      <div className="reading-col flex-1 overflow-auto px-5 md:px-8 py-8 scrollbar-thin">
        {[0, 1].map((blockIdx) => (
          <div key={blockIdx} className="mb-10">
            <Skeleton className="mb-3 h-5 w-32" />
            <SkeletonLines count={5} />
          </div>
        ))}
      </div>
    </div>
  );
}
