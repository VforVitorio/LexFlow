import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeroGraph } from '../mocks/HeroGraph';
import { GH_URL, IconArrow, IconGitHub } from '../icons';

export function Hero() {
  const { t } = useTranslation('landing');
  return (
    <section className="hero" id="top">
      <div className="lf-container hero-grid">
        <div>
          <div className="hero-badge">
            <span className="pill">{t('hero.status')}</span>
            <span>{t('hero.badge')}</span>
          </div>
          <h1>
            {t('hero.title1')}<br />
            <span className="accent">{t('hero.title2')}</span>
          </h1>
          <p className="hero-sub">{t('hero.sub')}</p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" to="/home">
              {t('hero.ctaPrimary')}
              <IconArrow />
            </Link>
            <a className="btn btn-secondary btn-lg" href={GH_URL} target="_blank" rel="noreferrer">
              <IconGitHub />
              {t('hero.ctaSecondary')}
            </a>
          </div>
          <div className="hero-meta">
            <span><span className="lf-dot lf-dot-g" /> {t('hero.meta1')}</span>
            <span><span className="lf-dot" style={{ background: 'hsl(252, 95%, 76%)', boxShadow: '0 0 8px hsl(252, 95%, 76%)' }} /> {t('hero.meta2')}</span>
            <span><span className="lf-dot" style={{ background: 'hsl(217, 91%, 60%)', boxShadow: '0 0 8px hsl(217, 91%, 60%)' }} /> {t('hero.meta3')}</span>
          </div>
        </div>
        <div className="hero-visual">
          <HeroGraph />
        </div>
      </div>
    </section>
  );
}
