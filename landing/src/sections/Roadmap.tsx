import { useTranslation } from 'react-i18next';

type Status = 'done' | 'progress' | 'planned';
interface Phase { name: string; desc: string; status: Status; }

export function Roadmap() {
  const { t } = useTranslation('landing');
  const phases = t('roadmap', { returnObjects: true }) as unknown as Phase[];

  const statusLabel = (s: Status) =>
    s === 'done'     ? t('statusDone')
    : s === 'progress' ? t('statusProgress')
    : t('statusPlanned');

  return (
    <section id="roadmap">
      <div className="lf-container">
        <div className="section-eyebrow">
          <span className="dot" />
          <span className="label-caps">{t('roadmapEyebrow')}</span>
        </div>
        <h2 className="section-title">{t('roadmapTitle')}</h2>
        <p className="section-sub">{t('roadmapSub')}</p>
        <div className="roadmap">
          {phases.map((p, i) => (
            <div key={i} className="phase">
              <div className="phase-num">PHASE {String(i + 1).padStart(2, '0')}</div>
              <div>
                <div className="phase-name">{p.name}</div>
                <div className="phase-desc">{p.desc}</div>
              </div>
              <div className={`phase-status ${p.status}`}>
                <span className="glow" />
                {statusLabel(p.status)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
