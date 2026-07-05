import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Search, ArrowRight, ChevronRight, Plus, GitCompareArrows, BookOpenText, Network, MessagesSquare, BarChart3, Hash } from 'lucide-react';
import { Badge, Card, Chip, Kbd } from '@/components/ui';
import { EmptyState } from '@/components/domain/EmptyState';
import { Skeleton } from '@/components/domain/Skeleton';
import { useLawsList, useSyncStatus, useTags } from '@/lib/queries';
import { useUi } from '@/lib/store';
import { formatNumber, modKey, timeAgo, statusLabel, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { pickGreeting } from '@/lib/greeting';
import type { Law } from '@/lib/types';
import { groupByRecency } from './home/recency-groups';

type ChipKind = 'chat' | 'diff' | 'explorer';

interface ExampleChip {
  label: string;
  kind: ChipKind;
  /** Route target. For 'chat' and 'explorer' this is already passed via
   *  the onClick handler below; kept here for documentation clarity. */
  target: string;
}

/**
 * Suggestion chips shown in the search hero.
 *
 * Each chip declares a `kind` so the click handler can route to the
 * correct surface instead of always sending everything to the Explorer:
 *   - 'chat'     → /chat   (natural-language questions)
 *   - 'diff'     → /laws/{id}/diff  (version-comparison prompts)
 *   - 'explorer' → /explorer?q=…   (plain keyword searches)
 */
const EXAMPLE_CHIPS: ExampleChip[] = [
  { label: 'Cambios al Código Penal en 2024',    kind: 'chat',     target: '/chat' },
  { label: '¿Qué exige el art. 28 de la LOPDGDD?', kind: 'chat',  target: '/chat' },
  { label: 'Diff entre v1.0 y v1.3 de la LOPDGDD', kind: 'diff',  target: '/laws/LO-3-2018/diff' },
  { label: 'Leyes autonómicas sobre vivienda',   kind: 'explorer', target: '/explorer?q=leyes+auton%C3%B3micas+vivienda' },
];

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  // Most recent laws by publication date — drives both the "Qué ha
  // cambiado" feed and the "Reciente" cards below. Limit handled at the
  // group level so the feed shows enough variety across buckets.
  const { data: laws, isLoading: lawsLoading } = useLawsList({ sort: 'date', limit: 12 });
  const { data: sync } = useSyncStatus();
  const { data: vocab = [] } = useTags();
  const greeting = useMemo(() => pickGreeting(), []);
  const recent = laws?.items.slice(0, 3) ?? [];
  const changedByDate = useMemo(
    () => (laws?.items ? groupByRecency(laws.items.slice(0, 10), new Date()) : []),
    [laws?.items],
  );

  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <div className="w-full max-w-content px-5 md:px-8 py-7">
        {/* Greeting — time-of-day aware; appends the user's name when
            stored (see #115 / #229 step 2). Plug-in seam for the
            randomised welcome pool (#248) is `lib/greeting.ts`. */}
        <header className="mb-7">
          <h1 className="font-display text-2xl md:text-4xl font-semibold -tracking-[0.015em]">{greeting.text}</h1>
          <p className="mt-1 text-[14.5px] text-muted">
            {t('home.syncPrefix')}{' '}
            <code className="font-mono text-[12.5px] text-indigo-600 dark:text-indigo-300">{sync?.upstream ?? 'legalize-es@main'}</code>{' '}
            {timeAgo(sync?.lastSyncAt)}.
          </p>
        </header>

        {/* Search hero */}
        <section className="mb-7 rounded-xl border border-border bg-gradient-to-b from-surface to-bg p-5">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-border-strong bg-bg px-3.5 text-left"
          >
            <Search className="size-[18px] text-muted" />
            <span className="flex-1 text-[15px] text-muted">{t('home.searchPlaceholder')}</span>
            <Kbd>{modKey} K</Kbd>
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_CHIPS.map(({ label, kind, target }) => (
              <Chip
                key={label}
                icon={<Sparkles className="size-3" />}
                className="bg-bg"
                // Chat chips carry the question through router state so ChatPage
                // can pre-fill the composer instead of landing on an empty chat.
                onClick={() => navigate(target, kind === 'chat' ? { state: { draft: label } } : undefined)}
              >
                {label}
              </Chip>
            ))}
          </div>

          {vocab.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="label-caps mr-1">{t('home.popularTags')}</span>
              {vocab.slice(0, 10).map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => navigate(`/explorer?tags=${encodeURIComponent(tag)}`)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-px font-mono text-[11.5px] text-indigo-700 hover:border-indigo-300 hover:bg-primary-soft dark:text-indigo-200 dark:hover:border-indigo-700"
                >
                  <Hash className="size-3 opacity-70" />{tag}
                  <span className="text-[10px] text-muted">{count}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* What changed + quick links */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <div className="mb-3.5 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold">{t('home.whatChanged')}</h2>
              <button
                onClick={() => navigate('/explorer?sort=date')}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-600 hover:underline dark:text-indigo-300"
              >
                {t('home.seeAll')} <ArrowRight className="size-3" />
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {lawsLoading && <ChangedFeedSkeleton />}
              {!lawsLoading && changedByDate.length === 0 && (
                <EmptyState
                  className="border-0"
                  title={t('home.empty.title')}
                  description={t('home.empty.description')}
                />
              )}
              {!lawsLoading && changedByDate.map((group, gi) => (
                <div key={group.bucket} className={cn(gi < changedByDate.length - 1 && 'border-b border-border')}>
                  <div className="label-caps px-4 pt-2.5 pb-1">{t(`home.buckets.${group.bucket}`)}</div>
                  {group.items.map((law) => (
                    <button
                      key={law.id}
                      onClick={() => navigate(`/laws/${encodeURIComponent(law.id)}`)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2/60"
                    >
                      <ChangedRowIcon law={law} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium">{law.short}</div>
                        <div className="truncate text-[12.5px] text-muted">
                          {law.title} · {formatDate(law.publicada)}
                        </div>
                      </div>
                      <ChevronRight className="size-3.5 shrink-0 text-muted" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3.5 font-display text-lg font-semibold">{t('home.shortcuts')}</h2>
            <div className="grid grid-cols-1 gap-2.5">
              <QuickTile icon={Network} tone="indigo" title={t('home.tiles.graphTitle')} sub={t('home.tiles.graphSub')} onClick={() => navigate('/graph')} />
              <QuickTile icon={MessagesSquare} tone="amber" title={t('home.tiles.chatTitle')} sub={t('home.tiles.chatSub')} onClick={() => navigate('/chat')} />
              <QuickTile icon={GitCompareArrows} tone="violet" title={t('home.tiles.diffTitle')} sub={t('home.tiles.diffSub')} onClick={() => navigate('/laws/LO-3-2018/diff')} />
              <QuickTile icon={BarChart3} tone="cyan" title={t('home.tiles.dashboardsTitle')} sub={t('home.tiles.dashboardsSub')} onClick={() => navigate('/dashboards')} />
            </div>
          </section>
        </div>

        {/* Recent laws */}
        <section className="mt-10">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">{t('home.recent')}</h2>
            <button onClick={() => navigate('/explorer')} className="text-[13px] font-medium text-indigo-600 dark:text-indigo-300">{t('home.openExplorer')}</button>
          </div>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {recent.map((l) => (
              <Card key={l.id} hoverable onClick={() => navigate(`/laws/${encodeURIComponent(l.id)}`)}>
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone={l.status === 'vigente' ? 'success' : l.status === 'derogada' ? 'danger' : 'amber'}>{statusLabel(l.status)}</Badge>
                  <span className="font-mono text-[11px] text-muted">{l.boe}</span>
                </div>
                <div className="font-display text-[15.5px] font-semibold leading-tight">{l.short}</div>
                <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted">{l.title}</p>
                {l.tags && l.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.tags.slice(0, 3).map((t) => (
                      <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft/60 px-1.5 py-px font-mono text-[10.5px] text-indigo-700 dark:text-indigo-200">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex gap-3.5 text-[11.5px] text-muted">
                  <span><span className="font-mono text-fg">{l.articulos}</span> {t('home.units.articles')}</span>
                  <span><span className="font-mono text-fg">{l.versiones}</span> {t('home.units.versions')}</span>
                  <span><span className="font-mono text-fg">{formatNumber(l.referencias)}</span> {t('home.units.refs')}</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Icon for a row in the "Qué ha cambiado" feed.
 *
 * The feed is sorted by `publicada` (publication date), so every entry
 * is a recent publication. The tone reflects the law's status so the
 * eye can quickly distinguish a brand-new vigente law from a recent
 * publication that's already been amended or repealed.
 */
function ChangedRowIcon({ law }: { law: Law }) {
  const palette =
    law.status === 'vigente'
      ? { Icon: Plus, cls: 'bg-success-soft text-success' }
      : law.status === 'modificada'
        ? { Icon: GitCompareArrows, cls: 'bg-amber-soft text-amber-700' }
        // Deslop #798: was a copy-pasted arbitrary HSL tint; now the shared
        // --reference-soft(-fg) tokens (index.css), which already flip light/dark.
        : { Icon: BookOpenText, cls: 'bg-[hsl(var(--reference-soft))] text-[hsl(var(--reference-soft-fg))]' };
  return (
    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-lg', palette.cls)}>
      <palette.Icon className="size-4" />
    </span>
  );
}

/** Skeleton for the "Qué ha cambiado" feed while `useLawsList` resolves. */
function ChangedFeedSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-5/12" />
            <Skeleton className="h-2.5 w-9/12" />
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickTile({
  icon: I, tone, title, sub, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'indigo' | 'amber' | 'violet' | 'cyan';
  title: string;
  sub: string;
  onClick: () => void;
}) {
  // Deslop #798: violet/cyan tints were copy-pasted arbitrary HSL values —
  // now sourced from the shared --reference-soft/--amendment-soft tokens
  // (index.css), which already flip light/dark, so no `dark:bg-*` needed.
  const palette: Record<typeof tone, string> = {
    indigo: 'bg-primary-soft text-indigo-700 dark:text-indigo-200',
    amber:  'bg-amber-soft text-amber-700 dark:text-amber-300',
    violet: 'bg-[hsl(var(--reference-soft))] text-[hsl(var(--reference-soft-fg))]',
    cyan:   'bg-[hsl(var(--amendment-soft))] text-[hsl(var(--amendment-soft-fg))]',
  };
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2/50"
    >
      <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-md', palette[tone])}>
        <I className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className="block text-[12px] leading-snug text-muted line-clamp-2">{sub}</span>
      </span>
    </button>
  );
}
