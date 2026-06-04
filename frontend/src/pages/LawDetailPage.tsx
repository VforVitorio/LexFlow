import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, X, GitCompareArrows, ExternalLink } from 'lucide-react';
import { LawHeader } from '@/components/domain/LawHeader';
import { ArticleBlock } from '@/components/domain/ArticleBlock';
import { CitationCard } from '@/components/domain/CitationCard';
import { VersionTimeline } from '@/components/domain/VersionTimeline';
import { ErrorState } from '@/components/domain/ErrorState';
import { Skeleton, SkeletonLines } from '@/components/domain/Skeleton';
import { Badge, Button, Callout, Tabs } from '@/components/ui';
import { RightRail } from '@/components/shell/RightRail';
import { useLaw, useVersions } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Article, ArticleRef, ChatSource } from '@/lib/types';

type Tab = 'texto' | 'versiones' | 'grafo' | 'refs' | 'disc';

export function LawDetailPage() {
  const { lawId } = useParams<{ lawId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const readingSize = useUi((s) => s.readingSize);
  const [tab, setTab] = useState<Tab>('texto');
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedRef, setSelectedRef] = useState<ArticleRef | null>(null);

  const { data: law, isLoading, error, refetch } = useLaw(lawId);
  const { data: versions = [] } = useVersions(lawId);

  // Load a couple of articles when the law arrives — in production each
  // article block would be lazy-loaded as the user scrolls.
  useEffect(() => {
    if (!lawId) return;
    api.laws.references(lawId).then(setArticles).catch(() => setArticles([]));
  }, [lawId]);

  if (error) return <div className="p-10"><ErrorState description={String(error)} onRetry={() => refetch()} /></div>;
  if (!law || isLoading) return <LoadingSkeleton />;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <LawHeader
          law={law}
          onTagClick={(t) => navigate(`/explorer?tags=${encodeURIComponent(t)}`)}
        />

        <div className="border-b border-border px-5 md:px-8">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            tabs={[
              { id: 'texto', label: t('lawDetail.tabs.texto'), count: law.articulos },
              { id: 'versiones', label: t('lawDetail.tabs.versiones'), count: law.versiones },
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
                  onClick={() => navigate(`/laws/${lawId}/diff`)}>
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
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/laws/${lawId}/diff`)}>{t('lawDetail.viewChanges')}</Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {(tab === 'grafo' || tab === 'refs' || tab === 'disc') && (
          <div className="flex-1 overflow-auto p-12 text-center text-muted">
            <p>{t('lawDetail.tabPending', { tab: t(`lawDetail.tabs.${tab}`) })}</p>
            {tab === 'grafo' && (
              <Button className="mt-4" onClick={() => navigate('/graph')}>{t('lawDetail.openGlobalGraph')}</Button>
            )}
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

function TextoTab({ articles, readingSize, onRefClick }: { articles: Article[]; readingSize: number; onRefClick: (r: ArticleRef) => void }) {
  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="reading-col px-5 md:px-8 py-9">
        <Callout tone="warning" title="Modificada por norma posterior">
          El art. 18.4 está parcialmente desarrollado por la <strong>LO 3/2018</strong>.{' '}
          <a className="underline" href="#">Ver diff →</a>
        </Callout>
        <div className="mt-7 mb-3.5">
          <span className="label-caps">Título I · Capítulo II · Sección 1.ª</span>
          <h2 className="mt-1 font-display text-2xl font-semibold -tracking-[0.01em]">
            De los derechos fundamentales y de las libertades públicas
          </h2>
        </div>
        {articles.map((a) => (
          <ArticleBlock key={a.id} article={a} size={readingSize} onCitationClick={onRefClick} />
        ))}
      </div>
    </div>
  );
}

function DetailRightRail({
  law, selectedRef, onDismiss, onNavigate,
}: {
  law: { short: string };
  selectedRef: ArticleRef | null;
  onDismiss: () => void;
  onNavigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  const mockSource: ChatSource = useMemo(() => ({
    law: 'Ley Orgánica 3/2018, de Protección de Datos',
    article: 'Art. 1',
    date: '6 dic 2018',
    snippet: 'La presente Ley Orgánica tiene por objeto adaptar el ordenamiento jurídico español al Reglamento (UE) 2016/679…',
    target: { lawId: 'LO-3-2018', articleNum: '1' },
  }), []);

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
        <>
          <div className="mb-4">
            <h3 className="font-display text-base font-semibold">{selectedRef.label}</h3>
            <p className="mt-1 text-[12.5px] text-muted">{t('lawDetail.citedFrom', { law: law.short })}</p>
          </div>
          <CitationCard source={mockSource} onClick={() => selectedRef.target && onNavigate(`/laws/${selectedRef.target.lawId}`)} />
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-muted">
            {t('lawDetail.selectCitation')}
          </p>
        </div>
      )}

      <div className="label-caps mb-2 mt-5">{t('lawDetail.relatedRefs')}</div>
      <div className="flex flex-col gap-0.5">
        {['LO 1/1982 · Honor', 'LECrim · art. 588', 'RGPD (UE) 2016/679', 'STC 292/2000'].map((r) => (
          <button key={r} className="flex items-center gap-2 rounded px-1.5 py-1.5 text-[13px] hover:bg-surface-2">
            <ExternalLink className="size-3 text-muted" /> {r}
          </button>
        ))}
      </div>
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
