import { useTranslation } from 'react-i18next';
import { LandingBrandMark } from '../mocks/LandingBrandMark';
import { GH_URL } from '../icons';

export function Footer() {
  const { t } = useTranslation('landing');
  const productLinks   = t('footer.productLinks',   { returnObjects: true }) as unknown as string[];
  const projectLinks   = t('footer.projectLinks',   { returnObjects: true }) as unknown as string[];
  const resourcesLinks = t('footer.resourcesLinks', { returnObjects: true }) as unknown as string[];

  return (
    <footer className="footer">
      <div className="lf-container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="#top" className="nav-brand">
              <LandingBrandMark size={24} />
              <span>LexFlow</span>
            </a>
            <p>{t('footer.tagline')}</p>
          </div>
          <div className="footer-col">
            <h5>{t('footer.product')}</h5>
            <ul>{productLinks.map((l, i) => <li key={i}><a href="#layers">{l}</a></li>)}</ul>
          </div>
          <div className="footer-col">
            <h5>{t('footer.project')}</h5>
            <ul>{projectLinks.map((l, i) => <li key={i}><a href={GH_URL} target="_blank" rel="noreferrer">{l}</a></li>)}</ul>
          </div>
          <div className="footer-col">
            <h5>{t('footer.resources')}</h5>
            <ul>{resourcesLinks.map((l, i) => <li key={i}><a href={GH_URL} target="_blank" rel="noreferrer">{l}</a></li>)}</ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 VforVitorio · {t('footer.legal')}</span>
          <span>github.com/VforVitorio/LexFlow</span>
        </div>
      </div>
    </footer>
  );
}
