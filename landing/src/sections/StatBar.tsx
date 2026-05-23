import { useTranslation } from 'react-i18next';
import { STAT_ICONS } from '../icons';

interface Stat { value: string; unit: string; label: string; }

export function StatBar() {
  const { t } = useTranslation('landing');
  const stats = t('stats', { returnObjects: true }) as unknown as Stat[];
  return (
    <section className="tight" style={{ paddingTop: 0, paddingBottom: 0 }}>
      <div className="lf-container">
        <div className="stat-bar">
          {stats.map((s, i) => (
            <div key={i} className="stat">
              <div className="stat-icon">{STAT_ICONS[i]}</div>
              <div className="stat-value">{s.value}<span className="unit">{s.unit}</span></div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
