import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Input, Tabs } from '@/components/ui';
import { Search } from 'lucide-react';
import { useSearch, useSemanticSearch, useWarmup } from '@/lib/queries';
import { groupBy } from '@/lib/utils';
import { EmptyState } from '@/components/domain/EmptyState';
import { HighlightedSnippet } from '@/components/domain/HighlightedSnippet';
import { SkeletonRows } from '@/components/domain/Skeleton';

type SearchMode = 'fulltext' | 'semantic';

function isMode(value: string | null): value is SearchMode {
  return value === 'fulltext' || value === 'semantic';
}

export function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const modeParam = params.get('mode');
  const mode: SearchMode = isMode(modeParam) ? modeParam : 'fulltext';
  const navigate = useNavigate();
  const { t } = useTranslation();

  const updateQuery = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('q', value);
    setParams(next, { replace: true });
  };
  const updateMode = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'fulltext') next.delete('mode');
    else next.set('mode', v);
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto h-full max-w-3xl overflow-auto px-5 md:px-8 py-7 scrollbar-thin">
      <Input
        icon={<Search className="size-3.5" />}
        defaultValue={q}
        placeholder={t('search.placeholder')}
        // Audit #409: ``setSearchParams`` defaults to a push
        // navigation in react-router-dom v6, so each keystroke
        // pushed a new history entry — pressing Back walked through
        // the typing animation instead of leaving /search. ``replace:
        // true`` keeps the URL synced without polluting history.
        onChange={(e) => updateQuery(e.target.value)}
        className="w-full"
      />

      {/* Audit #477 — Texto / Semántico tabs. Mode lives in the URL
          (`?mode=semantic`) so deep links pick the right surface.
          Both modes share the query input so the user can flip
          between them on the same query. */}
      <div className="mt-4">
        <Tabs
          variant="segmented"
          value={mode}
          onChange={updateMode}
          tabs={[
            { id: 'fulltext', label: t('search.modeFullText') },
            { id: 'semantic', label: t('search.modeSemantic') },
          ]}
        />
      </div>

      {mode === 'fulltext' ? (
        <FullTextResults q={q} navigate={navigate} />
      ) : (
        <SemanticResults q={q} navigate={navigate} />
      )}
    </div>
  );
}

function FullTextResults({ q, navigate }: { q: string; navigate: (to: string) => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useSearch(q);
  const { data: warmup } = useWarmup();
  const searchWarming = warmup && !warmup.searchReady;
  const grouped = groupBy(data?.hits ?? [], (h) => h.kind);

  return (
    <>
      <p className="mt-3 text-[12.5px] text-muted">
        {searchWarming
          ? t('search.indexing')
          : isLoading
            ? t('search.searching')
            : t('search.resultsFor', { n: data?.total ?? 0, q })}
      </p>
      {isLoading && q && <SkeletonRows className="mt-6" count={5} />}
      {!isLoading && data && data.total === 0 && (
        <EmptyState
          className="mt-8"
          title={t('search.empty.title')}
          description={t('search.empty.description')}
        />
      )}
      {Object.entries(grouped).map(([kind, hits]) => (
        <section key={kind} className="mt-6">
          <div className="label-caps mb-2 flex items-baseline justify-between">
            <span>{kind === 'law' ? t('search.groups.law') : kind === 'article' ? t('search.groups.article') : kind}</span>
            <button className="text-[12px] text-indigo-600 dark:text-indigo-300">{t('search.seeAll')}</button>
          </div>
          <div className="flex flex-col gap-1.5">
            {hits.map((h) => (
              <button
                key={h.id}
                onClick={() => {
                  const p = h.payload as { lawId?: string } | undefined;
                  if (p?.lawId) navigate(`/laws/${encodeURIComponent(p.lawId)}`);
                }}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left hover:bg-surface-2"
              >
                <Badge tone={h.kind === 'law' ? 'primary' : 'amber'}>{h.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{h.title}</div>
                  {h.snippet ? (
                    <div className="truncate text-[12.5px] text-muted">
                      <HighlightedSnippet
                        text={h.snippet}
                        match={h.match}
                        prefix={h.articleNumber ? `Art. ${h.articleNumber} — ` : undefined}
                      />
                    </div>
                  ) : (
                    h.subtitle && <div className="truncate text-[12.5px] text-muted">{h.subtitle}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/**
 * Audit #477 — Semantic search results. Always article-scoped: the
 * backend ranks by cosine similarity between the query embedding and
 * each article's embedding. Score in [0,1] rendered as a small bar so
 * the user can eyeball confidence at a glance.
 */
function SemanticResults({ q, navigate }: { q: string; navigate: (to: string) => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useSemanticSearch(q);
  const hits = data?.hits ?? [];

  if (!q.trim()) {
    return (
      <p className="mt-6 text-[13px] text-muted">{t('search.semanticEmptyQuery')}</p>
    );
  }
  if (isLoading) return <SkeletonRows className="mt-6" count={5} />;
  if (hits.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        title={t('search.semanticEmpty.title')}
        description={t('search.semanticEmpty.description')}
      />
    );
  }

  return (
    <section className="mt-6">
      <div className="label-caps mb-2">{t('search.semanticHeading', { n: hits.length })}</div>
      <div className="flex flex-col gap-1.5">
        {hits.map((h) => (
          <button
            key={`${h.lawId}::${h.articleNumber}`}
            onClick={() => navigate(`/laws/${encodeURIComponent(h.lawId)}#art-${encodeURIComponent(h.articleNumber)}`)}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-left hover:bg-surface-2"
          >
            <Badge tone="amber">art</Badge>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-mono text-[12.5px] text-muted">{h.lawId} · Art. {h.articleNumber}</div>
                <ScoreBar score={h.score} />
              </div>
              <div className="mt-1 text-[12.5px] text-muted line-clamp-2">{h.snippet}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span
          className="block h-full rounded-full bg-indigo-500"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-[11.5px] tabular-nums text-muted">{pct}%</span>
    </span>
  );
}
