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
          <h2 className="section-title section-title-accent" style={{ marginInline: 'auto' }}>{t('ctaTitle')}</h2>
          <p>{t('ctaSub')}</p>
          <div className="cta-actions">
            {/* Marketing landing must never link into the SPA mock — both
                CTAs go to the GitHub repo. See Nav.tsx for the same idiom. */}
            <a className="btn btn-primary btn-lg" href={GH_URL} target="_blank" rel="noreferrer">
              {t('ctaPrimary')}
              <IconArrow />
            </a>
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
