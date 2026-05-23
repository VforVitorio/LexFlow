import { useTranslation } from 'react-i18next';
import { TECH_LOGOS } from '../icons';

export function PoweredBy() {
  const { t } = useTranslation('landing');
  return (
    <section className="powered-by tight" style={{ padding: '40px 0' }}>
      <div className="lf-container">
        <div className="powered-by-row">
          <div className="powered-by-title">{t('footer.poweredBy')}</div>
          <div className="powered-by-logos">
            {TECH_LOGOS.map((l, i) => (
              <a
                key={i}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="powered-by-logo"
                aria-label={l.name}
              >
                {l.svg}
                <span>{l.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
