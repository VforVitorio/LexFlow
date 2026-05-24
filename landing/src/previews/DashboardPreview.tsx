/**
 * Landing-native preview that visually mirrors the SPA's DashboardPage.
 *
 * Same chrome (Compliance / Analytics tabs, action row, KPI cards with
 * sparklines, monthly bar chart), but rendered with the landing's CSS
 * tokens instead of Tailwind so we don't pull the SPA's design system
 * into the marketing bundle.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * SPA reference:  frontend/src/pages/DashboardPage.tsx
 * Styles:         landing/src/landing.css   .lf-prev-dash-*
 */

import type { Lang } from '@/i18n';
import { PreviewChrome } from './PreviewChrome';

const TITLE: Record<Lang, string> = { es: 'Paneles · LexFlow', en: 'Dashboards · LexFlow' };

interface KpiCard {
  title: string;
  value: string;
  delta: string;
  spark: number[];
}

const KPI_ES: KpiCard[] = [
  { title: 'Normas modificadas (12m)', value: '247', delta: '+12%', spark: [10, 14, 13, 18, 17, 22, 21, 26, 24, 28, 30, 33] },
  { title: 'Alertas activas',           value: '18',  delta: '+3',  spark: [3, 4, 4, 5, 6, 7, 6, 8, 9, 11, 13, 18] },
  { title: 'Ritmo de reformas',         value: '4.1', delta: 'estable', spark: [4, 4, 4.2, 3.9, 4.1, 4, 4.1, 4.2, 4.1, 4, 4.1, 4.1] },
];
const KPI_EN: KpiCard[] = [
  { title: 'Amended statutes (12m)', value: '247', delta: '+12%', spark: [10, 14, 13, 18, 17, 22, 21, 26, 24, 28, 30, 33] },
  { title: 'Active alerts',          value: '18',  delta: '+3',  spark: [3, 4, 4, 5, 6, 7, 6, 8, 9, 11, 13, 18] },
  { title: 'Reform pace',            value: '4.1', delta: 'flat', spark: [4, 4, 4.2, 3.9, 4.1, 4, 4.1, 4.2, 4.1, 4, 4.1, 4.1] },
];

// Real-looking monthly counts (Jan-Dec). Last 4 months get the amber accent
// so the chart reads as "recent activity" instead of "flat history".
const BAR_LABELS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const BAR_VALUES = [21, 18, 24, 26, 22, 29, 28, 31, 27, 34, 36, 33];
const RECENT_FROM = 8;

const COPY = {
  es: { tabA: 'Compliance', tabB: 'Analítica', range: 'Últimos 12 meses', sector: 'Sector: todos', csv: 'CSV', chartTitle: 'Reformas legislativas por mes', chartMeta: '2023-2024 · acumulado' },
  en: { tabA: 'Compliance', tabB: 'Analytics', range: 'Last 12 months', sector: 'Sector: all', csv: 'CSV', chartTitle: 'Legislative reforms per month', chartMeta: '2023-2024 · cumulative' },
} as const;

interface Props { lang: Lang; }

export function DashboardPreview({ lang }: Props) {
  const t = COPY[lang] ?? COPY.en;
  const cards = lang === 'es' ? KPI_ES : KPI_EN;
  return (
    <div className="lf-prev" aria-hidden="true">
      <PreviewChrome title={TITLE[lang] ?? TITLE.en} />
      <div className="lf-prev-body lf-prev-dash">
      <header className="lf-prev-dash-head">
        <span className="lf-prev-dash-h1">{lang === 'es' ? 'Cuadros de mando' : 'Dashboards'}</span>
        <div className="lf-prev-dash-tabs" role="tablist">
          <span className="lf-prev-dash-tab active" role="tab">{t.tabA}</span>
          <span className="lf-prev-dash-tab" role="tab">{t.tabB}</span>
        </div>
        <span className="lf-prev-dash-actions">
          <span className="lf-prev-pill">{t.range}</span>
          <span className="lf-prev-pill">{t.sector}</span>
          <span className="lf-prev-pill">{t.csv}</span>
        </span>
      </header>
      <div className="lf-prev-dash-grid">
        {cards.map((c) => <DashCard key={c.title} card={c} />)}
      </div>
      <div className="lf-prev-card lf-prev-dash-chart">
        <div className="lf-prev-dash-chart-head">
          <span className="lf-prev-dash-chart-title">{t.chartTitle}</span>
          <span className="lf-prev-dash-chart-meta">{t.chartMeta}</span>
        </div>
        <BarChart />
      </div>
      </div>
    </div>
  );
}

function DashCard({ card }: { card: KpiCard }) {
  const positive = card.delta.startsWith('+');
  const neutral = card.delta === 'estable' || card.delta === 'flat';
  const deltaCls = neutral ? 'muted' : positive ? 'success' : 'danger';
  return (
    <div className="lf-prev-card lf-prev-dash-kpi">
      <div className="lf-prev-dash-kpi-title">{card.title}</div>
      <div className="lf-prev-dash-kpi-row">
        <span className="lf-prev-dash-kpi-value">{card.value}</span>
        <span className={`lf-prev-dash-kpi-delta lf-prev-delta-${deltaCls}`}>{card.delta}</span>
      </div>
      <Sparkline data={card.spark} />
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 220, h = 36;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="lf-prev-spark" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="hsl(var(--blue-500))" strokeWidth="1.5" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="hsl(var(--blue-500) / 0.10)" />
    </svg>
  );
}

function BarChart() {
  const w = 880, h = 200, pad = 28;
  const max = Math.max(...BAR_VALUES);
  const barW = (w - pad * 2) / BAR_VALUES.length - 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="lf-prev-dash-bars" aria-hidden="true">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line
            x1={pad}
            x2={w - pad}
            y1={h - pad - (t / 100) * (h - pad * 2)}
            y2={h - pad - (t / 100) * (h - pad * 2)}
            stroke="hsl(var(--border))"
            strokeDasharray="3 3"
          />
        </g>
      ))}
      {BAR_VALUES.map((v, i) => {
        const x = pad + i * (barW + 4);
        const bh = (v / max) * (h - pad * 2);
        const y = h - pad - bh;
        const recent = i >= RECENT_FROM;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh}
              fill={recent ? 'hsl(var(--amber-500))' : 'hsl(var(--blue-500))'}
              rx={2}
              opacity={recent ? 0.92 : 0.78}
            />
            <text x={x + barW / 2} y={h - pad + 12} textAnchor="middle"
              fontSize="10" fill="hsl(var(--muted-fg))" fontFamily='"JetBrains Mono", monospace'>
              {BAR_LABELS[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
