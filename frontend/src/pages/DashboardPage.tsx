import { useState } from 'react';
import { Clock, SlidersHorizontal, Download, ExternalLink } from 'lucide-react';
import { Button, Card, Tabs } from '@/components/ui';
import { useDashboard } from '@/lib/queries';
import type { MetricCard } from '@/lib/types';

export function DashboardPage() {
  const [preset, setPreset] = useState<'compliance' | 'analytics'>('compliance');
  const { data, isLoading } = useDashboard(preset);

  return (
    <div className="h-full overflow-auto px-8 py-6 scrollbar-thin">
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-2xl font-semibold">Cuadros de mando</h1>
        <Tabs variant="segmented" value={preset} onChange={(v) => setPreset(v as 'compliance' | 'analytics')} tabs={[
          { id: 'compliance', label: 'Compliance' },
          { id: 'analytics', label: 'Analytics' },
        ]} />
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" icon={<Clock className="size-3.5" />}>Últimos 12 meses</Button>
          <Button size="sm" variant="secondary" icon={<SlidersHorizontal className="size-3.5" />}>Sector: Todos</Button>
          <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />}>CSV</Button>
        </span>
      </div>

      {(!data || isLoading) ? (
        <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-28 animate-pulse" />)}</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((c) => <DashCard key={c.id} card={c} />)}
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-baseline gap-2">
              <h3 className="font-display text-base font-semibold">Reformas legislativas por mes</h3>
              <span className="text-[12px] text-muted">2023 – 2024 · acumulado</span>
              <span className="ml-auto"><Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />}>Abrir en Plotly</Button></span>
            </div>
            <BigChart values={data.series.values} labels={data.series.labels} recentFrom={data.series.recentFrom} />
          </Card>
        </>
      )}
    </div>
  );
}

function DashCard({ card }: { card: MetricCard }) {
  const positive = card.delta.startsWith('+');
  const neutral = card.delta === 'estable';
  return (
    <Card className="p-4.5">
      <div className="text-[12.5px] text-muted">{card.title}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="font-display text-[26px] font-semibold -tracking-[0.01em]">{card.value}</span>
        <span className={`font-mono text-[12px] ${neutral ? 'text-muted' : positive ? 'text-success' : 'text-danger'}`}>{card.delta}</span>
      </div>
      <Sparkline data={card.spark} />
    </Card>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 220, h = 36;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2.5 h-10 w-full">
      <polyline points={pts} fill="none" stroke="hsl(232 72% 52%)" strokeWidth="1.5" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="hsl(232 72% 52% / 0.10)" />
    </svg>
  );
}

function BigChart({ values, labels, recentFrom = 0 }: { values: number[]; labels: string[]; recentFrom?: number }) {
  const w = 880, h = 240, pad = 28;
  const max = Math.max(...values);
  const barW = (w - pad * 2) / values.length - 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-60 w-full">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line x1={pad} y1={h - pad - (t / 100) * (h - pad * 2)} x2={w - pad} y2={h - pad - (t / 100) * (h - pad * 2)}
            stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <text x={pad - 6} y={h - pad - (t / 100) * (h - pad * 2) + 3}
            textAnchor="end" fontSize="10" fill="hsl(var(--muted-fg))" fontFamily='"JetBrains Mono", monospace'>
            {Math.round(max * t / 100)}
          </text>
        </g>
      ))}
      {values.map((v, i) => {
        const x = pad + i * (barW + 4);
        const bh = (v / max) * (h - pad * 2);
        const y = h - pad - bh;
        const recent = i >= recentFrom;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh}
              fill={recent ? 'hsl(36 95% 56%)' : 'hsl(232 72% 52%)'} rx={2} />
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={h - pad + 12} textAnchor="middle"
                fontSize="9.5" fill="hsl(var(--muted-fg))" fontFamily='"JetBrains Mono", monospace'>
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
