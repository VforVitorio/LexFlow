import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Input } from '@/components/ui';
import { Search } from 'lucide-react';
import { useSearch, useWarmup } from '@/lib/queries';
import { groupBy } from '@/lib/utils';
import { EmptyState } from '@/components/domain/EmptyState';
import { HighlightedSnippet } from '@/components/domain/HighlightedSnippet';
import { SkeletonRows } from '@/components/domain/Skeleton';

export function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, isLoading } = useSearch(q);
  const { data: warmup } = useWarmup();
  const searchWarming = warmup && !warmup.searchReady;

  const grouped = groupBy(data?.hits ?? [], (h) => h.kind);

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
        onChange={(e) => setParams({ q: e.target.value }, { replace: true })}
        className="w-full"
      />
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
    </div>
  );
}
