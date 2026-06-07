import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Download, ArrowRight } from 'lucide-react';
import { Button, Kbd, Tabs } from '@/components/ui';
import { DiffViewer } from '@/components/domain/DiffViewer';
import { ErrorState } from '@/components/domain/ErrorState';
import { RightRail } from '@/components/shell/RightRail';
import { useDiff, useLaw, useVersions } from '@/lib/queries';
import { formatDate } from '@/lib/utils';

export function DiffPage() {
  const { lawId } = useParams<{ lawId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [view, setView] = useState<'side' | 'inline'>('side');
  const [active, setActive] = useState(0);

  const { data: law } = useLaw(lawId);
  // Audit #470 — the backend `LawDiff` regex enforces `^[0-9a-f]{7,40}$`
  // (real commit SHAs). The page used to default to mock semver tags
  // ('v1.0' / 'v1.3'), which 422'd the request before the user could
  // see anything. We now derive defaults from the law's versions: the
  // newest two SHAs in the timeline. The `from`/`to` URL params still
  // win when present so deep links from LawDetail work.
  const { data: versions = [] } = useVersions(lawId);
  const fallbackTo = versions[0]?.tag;
  const fallbackFrom = versions[1]?.tag;
  const fromTag = searchParams.get('from') ?? fallbackFrom ?? '';
  const toTag = searchParams.get('to') ?? fallbackTo ?? '';

  const { data: diff, isLoading, error, refetch } = useDiff(lawId, fromTag, toTag);

  if (!fromTag || !toTag) {
    return <div className="p-10 text-muted">{t('diff.loading')}</div>;
  }
  if (error) return <div className="p-10"><ErrorState description={String(error)} onRetry={() => refetch()} /></div>;
  if (!diff || isLoading) return <div className="p-10 text-muted">{t('diff.loading')}</div>;

  const article = diff.articles[active];
  if (!article) {
    return (
      <div className="p-10 text-muted">{t('diff.noChanges')}</div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-bg px-5 md:px-8 pt-5 pb-4">
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={() => navigate(`/laws/${encodeURIComponent(lawId ?? '')}`)}
              className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"
            >
              <ChevronLeft className="size-3.5" /> {t('diff.backTo', { law: law?.short ?? t('diff.theLaw') })}
            </button>
            <span className="ml-auto flex items-center gap-2">
              <Tabs variant="segmented" value={view} onChange={(v) => setView(v as 'side' | 'inline')} tabs={[
                { id: 'side', label: t('diff.sideBySide') },
                { id: 'inline', label: t('diff.inline') },
              ]} />
              <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>{t('diff.exportDiff')}</Button>
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold">
            Diff · {article.titulo}{' '}
            <span className="font-mono text-lg text-amber-700 dark:text-amber-400">(Art. {article.num})</span>
          </h1>
          <div className="mt-2 flex items-center gap-3.5 text-[13px] text-muted">
            <span className="font-mono">{diff.from.tag} <span className="text-fg">{formatDate(diff.from.date)}</span></span>
            <ArrowRight className="size-3.5" />
            <span className="font-mono">{diff.to.tag} <span className="text-fg">{formatDate(diff.to.date)}</span></span>
            <span className="ml-auto inline-flex items-center gap-3">
              <span><span className="font-semibold text-success">+{article.totals.added}</span> {t('diff.added')}</span>
              <span><span className="font-semibold text-danger">−{article.totals.removed}</span> {t('diff.removed')}</span>
              <span className="inline-flex items-center gap-1.5"><Kbd>j</Kbd><Kbd>k</Kbd> {t('diff.nextPrev')}</span>
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <DiffViewer diff={article} view={view} />
        </div>
      </div>

      <RightRail>
        <div className="label-caps mb-3">{t('diff.changedArticles')} · {diff.articles.length}</div>
        <div className="flex flex-col gap-1">
          {diff.articles.map((a, i) => (
            <button
              key={a.num}
              onClick={() => setActive(i)}
              className={`rounded px-2.5 py-2 text-left transition-colors ${i === active ? 'bg-primary-soft' : 'hover:bg-surface-2'}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[12px] font-semibold text-amber-700 dark:text-amber-400">Art. {a.num}</span>
                <span className="ml-auto font-mono text-[11px] text-success">+{a.totals.added}</span>
                {a.totals.removed > 0 && <span className="font-mono text-[11px] text-danger">−{a.totals.removed}</span>}
              </div>
              <div className={`mt-0.5 text-[12.5px] ${i === active ? 'font-semibold text-indigo-700 dark:text-indigo-200' : 'text-fg'}`}>
                {a.titulo}
              </div>
            </button>
          ))}
        </div>
      </RightRail>
    </div>
  );
}
