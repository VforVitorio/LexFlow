import { useTranslation } from 'react-i18next';

interface StackCol {
  name: string;
  meta: string;
  rows: [string, string][];
}

export function Stack() {
  const { t } = useTranslation('landing');
  const backend  = t('stackBackend',  { returnObjects: true }) as unknown as StackCol;
  const frontend = t('stackFrontend', { returnObjects: true }) as unknown as StackCol;

  return (
    <section id="stack">
      <div className="lf-container">
        <div className="section-eyebrow">
          <span className="dot" />
          <span className="label-caps">{t('stackEyebrow')}</span>
        </div>
        <h2 className="section-title">{t('stackTitle')}</h2>
        <p className="section-sub">{t('stackSub')}</p>
        <div className="stack-grid">
          {[backend, frontend].map((s, i) => (
            <div key={i} className="stack-col">
              <h4>{s.name}</h4>
              <div className="stack-meta">{s.meta}</div>
              {s.rows.map((r, j) => (
                <div key={j} className="stack-row">
                  <div className="k">{r[0]}</div>
                  <div className="v">{r[1]}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
