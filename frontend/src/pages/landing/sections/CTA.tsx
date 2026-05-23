import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GH_URL, IconArrow, IconGitHub } from '../icons';

export function CTA() {
  const { t } = useTranslation('landing');
  return (
    <section className="tight">
      <div className="lf-container">
        <div className="cta-block">
          <div className="section-eyebrow" style={{ justifyContent: 'center' }}>
            <span className="dot" />
            <span className="label-caps">{t('ctaEyebrow')}</span>
          </div>
          <h2>{t('ctaTitle')}</h2>
          <p>{t('ctaSub')}</p>
          <div className="cta-actions">
            <Link className="btn btn-primary btn-lg" to="/dashboards">
              {t('ctaPrimary')}
              <IconArrow />
            </Link>
            <a className="btn btn-secondary btn-lg" href={GH_URL} target="_blank" rel="noreferrer">
              <IconGitHub />
              {t('ctaSecondary')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
