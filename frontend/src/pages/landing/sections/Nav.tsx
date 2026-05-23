import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LandingBrandMark } from '../mocks/LandingBrandMark';
import { GH_URL, IconArrow, IconGitHub, IconMoon, IconSun } from '../icons';
import { useUi } from '@/lib/store';
import { SUPPORTED_LANGS, type Lang } from '@/i18n';

export function Nav() {
  const { t, i18n } = useTranslation('landing');
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);

  const currentLang = (SUPPORTED_LANGS.includes(i18n.resolvedLanguage as Lang)
    ? (i18n.resolvedLanguage as Lang)
    : 'es');

  const setLang = (l: Lang) => {
    if (l !== currentLang) void i18n.changeLanguage(l);
  };

  return (
    <header className="nav">
      <div className="lf-container nav-inner">
        <a href="#top" className="nav-brand">
          <LandingBrandMark size={26} />
          <span>LexFlow</span>
        </a>
        <nav className="nav-links">
          <a href="#layers">{t('nav.features')}</a>
          <a href="#stack">{t('nav.stack')}</a>
          <a href="#roadmap">{t('nav.roadmap')}</a>
        </nav>
        <div className="nav-spacer" />
        <div className="nav-actions">
          <div className="seg" role="group" aria-label="Language">
            <button type="button" className={currentLang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            <button type="button" className={currentLang === 'es' ? 'active' : ''} onClick={() => setLang('es')}>ES</button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <a className="icon-btn" href={GH_URL} target="_blank" rel="noreferrer" aria-label="GitHub">
            <IconGitHub />
          </a>
          <Link className="btn btn-primary" to="/dashboards" style={{ marginLeft: 4 }}>
            {t('nav.cta')}
            <IconArrow />
          </Link>
        </div>
      </div>
    </header>
  );
}
