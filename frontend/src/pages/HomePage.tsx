import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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

const EXAMPLE_QUERIES = [
  'Cambios al Código Penal en 2024',
  '¿Qué exige el art. 28 de la LOPDGDD?',
  'Diff entre v1.0 y v1.3 de la LOPDGDD',
  'Leyes autonómicas sobre vivienda',
];

/** Date buckets for the "Qué ha cambiado" section. */
type RecencyBucket = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'older';

const BUCKET_LABEL: Record<RecencyBucket, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  'this-week': 'Esta semana',
  'this-month': 'Este mes',
  older: 'Anteriores',
};

const BUCKET_ORDER: RecencyBucket[] = ['today', 'yesterday', 'this-week', 'this-month', 'older'];

function recencyBucket(iso: string, now: Date): RecencyBucket {
  const days = (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return 'this-week';
  if (days < 30) return 'this-month';
  return 'older';
}

/** Bucket the most-recent laws into date groups for display. */
function groupByRecency(laws: Law[], now: Date): Array<{ bucket: RecencyBucket; items: Law[] }> {
  const map = new Map<RecencyBucket, Law[]>();
  for (const l of laws) {
    const b = recencyBucket(l.publicada, now);
    const arr = map.get(b) ?? [];
    arr.push(l);
    map.set(b, arr);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({ bucket, items: map.get(bucket)! }));
}

export function HomePage() {
  const navigate = useNavigate();
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
      <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10 py-7">
        {/* Greeting — time-of-day aware; appends the user's name when
            stored (see #115 / #229 step 2). Plug-in seam for the
            randomised welcome pool (#248) is `lib/greeting.ts`. */}
        <header className="mb-7">
          <h1 className="font-display text-4xl font-semibold -tracking-[0.015em]">{greeting.text}</h1>
          <p className="mt-1 text-[14.5px] text-muted">
            El corpus está al día. Última sincronización con{' '}
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
            <span className="flex-1 text-[15px] text-muted">Pregunta o busca cualquier norma…</span>
            <Kbd>{modKey} K</Kbd>
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((q) => (
              <Chip key={q} icon={<Sparkles className="size-3" />} className="bg-bg">{q}</Chip>
            ))}
          </div>

          {vocab.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="label-caps mr-1">Tags populares</span>
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
              <h2 className="font-display text-lg font-semibold">Qué ha cambiado</h2>
              <button
                onClick={() => navigate('/explorer?sort=date')}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-indigo-600 hover:underline dark:text-indigo-300"
              >
                Ver todo <ArrowRight className="size-3" />
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {lawsLoading && <ChangedFeedSkeleton />}
              {!lawsLoading && changedByDate.length === 0 && (
                <EmptyState
                  className="border-0"
                  title="Sin novedades"
                  description="El corpus no tiene publicaciones recientes. Sincroniza con legalize-es para traer los últimos cambios."
                />
              )}
              {!lawsLoading && changedByDate.map((group, gi) => (
                <div key={group.bucket} className={cn(gi < changedByDate.length - 1 && 'border-b border-border')}>
                  <div className="label-caps px-4 pt-2.5 pb-1">{BUCKET_LABEL[group.bucket]}</div>
                  {group.items.map((law) => (
                    <button
                      key={law.id}
                      onClick={() => navigate(`/laws/${law.id}`)}
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
            <h2 className="mb-3.5 font-display text-lg font-semibold">Atajos</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <QuickTile icon={Network} tone="indigo" title="Grafo de referencias" sub="Ver cómo se citan las normas" onClick={() => navigate('/graph')} />
              <QuickTile icon={MessagesSquare} tone="amber" title="Chat con el corpus" sub="Pregunta en lenguaje natural" onClick={() => navigate('/chat')} />
              <QuickTile icon={GitCompareArrows} tone="violet" title="Comparar versiones" sub="LOPDGDD · v1.0 → v1.3" onClick={() => navigate('/laws/LO-3-2018/diff')} />
              <QuickTile icon={BarChart3} tone="cyan" title="Cuadros de mando" sub="Compliance · 6 indicadores" onClick={() => navigate('/dashboards')} />
            </div>
          </section>
        </div>

        {/* Recent laws */}
        <section className="mt-10">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">Reciente</h2>
            <button onClick={() => navigate('/explorer')} className="text-[13px] font-medium text-indigo-600 dark:text-indigo-300">Abrir explorador →</button>
          </div>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {recent.map((l) => (
              <Card key={l.id} hoverable onClick={() => navigate(`/laws/${l.id}`)}>
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
                  <span><span className="font-mono text-fg">{l.articulos}</span> arts.</span>
                  <span><span className="font-mono text-fg">{l.versiones}</span> versiones</span>
                  <span><span className="font-mono text-fg">{formatNumber(l.referencias)}</span> refs.</span>
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
        : { Icon: BookOpenText, cls: 'bg-[hsl(266_65%_92%/.5)] text-[hsl(266_50%_40%)] dark:bg-[hsl(266_30%_22%)] dark:text-[hsl(266_60%_80%)]' };
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
  const palette: Record<typeof tone, string> = {
    indigo: 'bg-primary-soft text-indigo-700 dark:text-indigo-200',
    amber:  'bg-amber-soft text-amber-700 dark:text-amber-300',
    violet: 'bg-[hsl(266_65%_92%/.5)] text-[hsl(266_50%_40%)] dark:bg-[hsl(266_30%_22%)] dark:text-[hsl(266_60%_80%)]',
    cyan:   'bg-[hsl(195_70%_92%/.5)] text-[hsl(195_70%_28%)] dark:bg-[hsl(195_30%_22%)] dark:text-[hsl(195_50%_80%)]',
  };
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2/50"
    >
      <span className={cn('mb-1.5 inline-flex size-8 items-center justify-center rounded-md', palette[tone])}>
        <I className="size-4" />
      </span>
      <span className="text-[13.5px] font-semibold">{title}</span>
      <span className="text-[12px] text-muted">{sub}</span>
    </button>
  );
}
