import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, SlidersHorizontal, Download, TrendingUp, TrendingDown } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, Card, Tabs } from '@/components/ui';
import { Skeleton } from '@/components/domain/Skeleton';
import { useDashboard } from '@/lib/queries';
import { GRAPH_KIND_FILL, GRAPH_PRIMARY } from '@/lib/graph-colors';
import type { MetricCard } from '@/lib/types';

// The dashboard charts borrow the graph palette so the whole product reads
// as one brand: indigo for the baseline series, amber (the "article" hue)
// to tint the most-recent slice of the hero chart.
const CHART_PRIMARY = GRAPH_PRIMARY;
const CHART_RECENT = GRAPH_KIND_FILL.article;

type DashboardPreset = 'compliance' | 'analytics';
const VALID_PRESETS: DashboardPreset[] = ['compliance', 'analytics'];

function asPreset(raw: string | undefined): DashboardPreset {
  return VALID_PRESETS.includes(raw as DashboardPreset) ? (raw as DashboardPreset) : 'compliance';
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Audit #409 — read the `:preset` URL param so deep links like
  // `/dashboards/analytics` actually land on Analytics. Tab changes also
  // navigate so URL ↔ state stay in sync both ways.
  const { preset: presetParam } = useParams<{ preset?: string }>();
  const [preset, setPreset] = useState<DashboardPreset>(asPreset(presetParam));
  useEffect(() => {
    const next = asPreset(presetParam);
    if (next !== preset) setPreset(next);
  }, [presetParam, preset]);
  const handleTabChange = (v: string) => {
    const next = asPreset(v);
    setPreset(next);
    navigate(`/dashboards/${next}`);
  };
  const { data, isLoading } = useDashboard(preset);

  return (
    <div className="h-full overflow-auto px-5 md:px-8 py-6 scrollbar-thin">
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-2xl font-semibold">{t('dashboards.title')}</h1>
        <Tabs variant="segmented" value={preset} onChange={handleTabChange} tabs={[
          { id: 'compliance', label: 'Compliance' },
          { id: 'analytics', label: 'Analytics' },
        ]} />
        {/* Deslop sprint #798 — date-range/sector filters and CSV export
            aren't wired to the backend yet; honest-disable instead of a
            dead toolbar. */}
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" icon={<Clock className="size-3.5" />} disabled title={t('chat.comingSoon')}>{t('dashboards.last12Months')}</Button>
          <Button size="sm" variant="secondary" icon={<SlidersHorizontal className="size-3.5" />} disabled title={t('chat.comingSoon')}>{t('dashboards.sectorAll')}</Button>
          <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} disabled title={t('chat.comingSoon')}>CSV</Button>
        </span>
      </div>

      {(!data || isLoading) ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((c) => <DashCard key={c.id} card={c} />)}
          </div>

          <Card className="p-5">
            {/* Deslop sprint #798 — "Open in Plotly" removed: the chart is
                rendered with Recharts, not Plotly, so the label named a
                library this app doesn't use. Removing beats disabling a
                control that could never be honestly wired as described. */}
            <div className="mb-1 flex items-baseline gap-2">
              <h3 className="font-display text-base font-semibold">{t('dashboards.chartTitle')}</h3>
              <span className="text-[12px] text-muted">{t('dashboards.chartSubtitle')}</span>
            </div>
            <BigChart values={data.series.values} labels={data.series.labels} recentFrom={data.series.recentFrom} />
          </Card>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy>
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-7/12" />
            <div className="mt-2 flex items-baseline gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="mt-3 h-12 w-full" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="mb-3 flex items-baseline gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-72 w-full" />
      </Card>
    </div>
  );
}

function DashCard({ card }: { card: MetricCard }) {
  const positive = card.delta.startsWith('+');
  const neutral = card.delta === 'estable';
  const deltaTone = neutral ? 'text-muted' : positive ? 'text-success' : 'text-danger';
  return (
    <Card className="p-5 transition-shadow hover:shadow-1">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-medium text-muted">{card.title}</div>
        <span className={`inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] ${deltaTone}`}>
          {!neutral && (positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
          {card.delta}
        </span>
      </div>
      <div className="mt-1 font-display text-[28px] font-semibold -tracking-[0.01em] tabular-nums">{card.value}</div>
      <Sparkline data={card.spark} id={card.id} />
    </Card>
  );
}

function Sparkline({ data, id }: { data: number[]; id: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  const gradId = `spark-${id}`;
  return (
    <div className="mt-3 h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={CHART_PRIMARY} strokeWidth={2} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface HeroDatum {
  label: string;
  value: number;
}

function BigChart({ values, labels, recentFrom = 0 }: { values: number[]; labels: string[]; recentFrom?: number }) {
  const chartData: HeroDatum[] = values.map((v, i) => ({ label: labels[i], value: v }));
  const recentLabel = labels[recentFrom];
  const lastLabel = labels[labels.length - 1];
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="hero-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.28} />
              <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-fg))' }}
          />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-fg))' }}
          />
          <Tooltip content={<DashTooltip />} cursor={{ stroke: 'hsl(var(--border-strong))', strokeDasharray: '3 3' }} />
          {recentLabel && lastLabel && recentFrom < values.length && (
            // Tint the most-recent window so "lo nuevo" reads at a glance.
            <ReferenceArea x1={recentLabel} x2={lastLabel} fill={CHART_RECENT} fillOpacity={0.07} strokeOpacity={0} />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_PRIMARY}
            strokeWidth={2.5}
            fill="url(#hero-grad)"
            dot={{ r: 2.5, fill: CHART_PRIMARY, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: CHART_PRIMARY, stroke: 'hsl(var(--bg))', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Recharts injects active/payload/label when it clones the `content`
// element; we type only the fields we read (v3's TooltipProps shape shifts).
interface DashTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number | string }>;
}

function DashTooltip({ active, payload, label }: DashTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface px-3 py-2 shadow-lg">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold text-fg tabular-nums">{payload[0]?.value}</div>
    </div>
  );
}
