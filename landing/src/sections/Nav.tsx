import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LandingBrandMark } from '../mocks/LandingBrandMark';
import { GH_URL, IconArrow, IconGitHub, IconMoon, IconSun } from '../icons';
import { useUi } from '@/lib/theme';
import { SUPPORTED_LANGS, type Lang } from '@/i18n';

const NAV_SECTIONS = ['layers', 'stack', 'roadmap'] as const;
type NavSection = typeof NAV_SECTIONS[number];

interface UnderlineRect { left: number; width: number; opacity: number; }
const HIDDEN: UnderlineRect = { left: 0, width: 0, opacity: 0 };

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

  // #151 — scroll-spy moving underline. IntersectionObserver picks the
  // section closest to the mid-line of the viewport; a single absolutely
  // positioned span slides between the matching nav links.
  const linkRefs = useRef<Record<NavSection, HTMLAnchorElement | null>>({
    layers: null, stack: null, roadmap: null,
  });
  const navListRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<NavSection | null>(null);
  const [rect, setRect] = useState<UnderlineRect>(HIDDEN);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry currently intersecting with the highest ratio. The
        // 45% / 45% rootMargin pins the observer to the middle of the
        // viewport, so the active section is whichever passes the centre.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((best, e) =>
          e.intersectionRatio > best.intersectionRatio ? e : best
        );
        const id = top.target.id as NavSection;
        if (NAV_SECTIONS.includes(id)) setActive(id);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] }
    );
    NAV_SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || !navListRef.current) { setRect(HIDDEN); return; }
    const link = linkRefs.current[active];
    if (!link) { setRect(HIDDEN); return; }
    const parent = navListRef.current.getBoundingClientRect();
    const child = link.getBoundingClientRect();
    setRect({ left: child.left - parent.left, width: child.width, opacity: 1 });
  }, [active]);

  return (
    <header className="nav">
      <div className="lf-container nav-inner">
        <a href="#top" className="nav-brand">
          <LandingBrandMark size={26} />
          <span>LexFlow</span>
        </a>
        <nav className="nav-links" ref={navListRef}>
          {NAV_SECTIONS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              ref={(el) => { linkRefs.current[id] = el; }}
              aria-current={active === id ? 'true' : undefined}
              className={active === id ? 'active' : undefined}
            >
              {t(`nav.${id === 'layers' ? 'features' : id}`)}
            </a>
          ))}
          {/* The moving underline. One span shared across every link; we
              animate its left + width instead of toggling a border per item. */}
          <span
            className="nav-underline"
            style={{
              transform: `translateX(${rect.left}px)`,
              width: rect.width,
              opacity: rect.opacity,
            }}
            aria-hidden="true"
          />
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
          {/* The marketing landing is a separate static site from the SPA
              (see main.tsx VITE_BUILD_TARGET). The primary nav CTA points
              to the GitHub repo so visitors who click it land on install
              instructions, releases and source — never on a stubbed SPA
              page running on mock data. */}
          <a
            className="btn btn-primary"
            href={GH_URL}
            target="_blank"
            rel="noreferrer"
            style={{ marginLeft: 4 }}
          >
            {t('nav.cta')}
            <IconArrow />
          </a>
        </div>
      </div>
    </header>
  );
}
