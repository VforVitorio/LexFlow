import type { Lang } from '@/i18n';

const YEARS = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
const VALS = [42, 51, 67, 58, 73, 81, 76, 64];
const MAX = Math.max(...VALS);

const COPY: Record<Lang, { title: string; sub: string; kpi: string; delta: string }> = {
  es: { title: 'Reformas por año', sub: 'Boletín Oficial · BOE', kpi: 'Cambios YTD', delta: '+12% vs 2024' },
  en: { title: 'Reforms per year', sub: 'Official gazette · BOE', kpi: 'YTD changes', delta: '+12% vs 2024' },
};

export function DashboardMockup({ lang }: { lang: Lang }) {
  const t = COPY[lang] ?? COPY.en;
  return (
    <div className="lf-mock lf-mock-dash">
      <div className="lf-dash-head">
        <div>
          <div className="lf-dash-title">{t.title}</div>
          <div className="lf-dash-sub">{t.sub}</div>
        </div>
        <div className="lf-dash-kpi">
          <div className="lf-dash-kpi-v">512</div>
          <div className="lf-dash-kpi-l">{t.kpi}</div>
          <div className="lf-dash-kpi-d">{t.delta}</div>
        </div>
      </div>
      <div className="lf-bars">
        {VALS.map((v, i) => (
          <div key={i} className="lf-bar-col">
            <div
              className="lf-bar"
              style={{
                height: `${(v / MAX) * 100}%`,
                background: i === VALS.length - 2
                  ? 'linear-gradient(180deg, hsl(252, 95%, 76%), hsl(217, 91%, 60%))'
                  : 'hsl(var(--violet-500) / 0.35)',
              }}
            />
            <div className="lf-bar-label">{YEARS[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
