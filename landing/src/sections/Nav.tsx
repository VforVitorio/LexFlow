import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LandingBrandMark } from '../mocks/LandingBrandMark';
import { GH_URL, IconArrow, IconClose, IconGitHub, IconMenu, IconMoon, IconSun } from '../icons';
import { useUi } from '@/lib/theme';
import { SUPPORTED_LANGS, type Lang } from '@/i18n';

// #186 — Top-nav reorientation. "Stack" was a dev-detail wormhole next to
// the main product tabs, so it's gone from the centre row (it still lives
// on the page under the "Para devs" zone). New order: Funcionalidades →
// Cómo lo usas → Roadmap. The matching anchor ids must exist on the
// rendered sections: #layers, #how-you-use, #roadmap.
const NAV_SECTIONS = ['layers', 'how-you-use', 'roadmap'] as const;
type NavSection = typeof NAV_SECTIONS[number];

// Maps each scroll-spy section id to the `nav.<key>` translation. Decouples
// the DOM ids (kept short for the URL hash) from the i18n keys.
const NAV_LABEL_KEY: Record<NavSection, string> = {
  layers: 'features',
  'how-you-use': 'howYouUse',
  roadmap: 'roadmap',
};

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
  // positioned span slides between the matching nav links. Mirrors
  // f1stratlab-web's `.nav-bar` idiom (docs/_review/landing-f1stratlab-...).
  const linkRefs = useRef<Record<NavSection, HTMLAnchorElement | null>>({
    layers: null, 'how-you-use': null, roadmap: null,
  });
  const navListRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<NavSection | null>(null);
  const [rect, setRect] = useState<UnderlineRect>(HIDDEN);
  const [scrolled, setScrolled] = useState(false);
  // #716 — mobile menu. The centre links + EN/ES seg + "Para devs" link are
  // display:none ≤720px; a hamburger reveals them in a slide-down panel.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Tall sections often span past both edges of the 10% band, so
        // `isIntersecting` may be false while `intersectionRatio === 0` —
        // we still want them active when their midline is in the band. We
        // pick the entry with the highest ratio among all observed (not
        // just intersecting) so very tall sections still register.
        const ranked = entries
          .filter((e) => e.intersectionRatio > 0 || e.isIntersecting)
          .reduce<IntersectionObserverEntry | null>(
            (best, e) => (!best || e.intersectionRatio > best.intersectionRatio ? e : best),
            null,
          );
        if (!ranked) return;
        const id = ranked.target.id as NavSection;
        if (NAV_SECTIONS.includes(id)) setActive(id);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    NAV_SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Lift shadow + bottom-border once we've moved past the hero. 24 px gives
  // it a beat after the very first scroll instead of triggering on every
  // micro-bounce of trackpad inertia.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on Escape or once the viewport grows past the
  // mobile breakpoint. Listeners only live while the menu is open.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onResize = () => { if (window.innerWidth > 720) close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  // Re-measure the underline on resize so it never drifts off the link
  // (fonts loading late, viewport rotation, etc.).
  useEffect(() => {
    if (!active || !navListRef.current) { setRect(HIDDEN); return; }
    const measure = () => {
      const list = navListRef.current;
      const link = linkRefs.current[active];
      if (!list || !link) { setRect(HIDDEN); return; }
      const parent = list.getBoundingClientRect();
      const child = link.getBoundingClientRect();
      setRect({ left: child.left - parent.left, width: child.width, opacity: 1 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);

  return (
    <header className={`nav${scrolled ? ' is-scrolled' : ''}`}>
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
              aria-current={active === id ? 'page' : undefined}
              className={active === id ? 'active' : undefined}
            >
              {t(`nav.${NAV_LABEL_KEY[id]}`)}
            </a>
          ))}
          {/* The moving underline. One span shared across every link; it has a
              fixed 100px base width and we animate transform (translateX +
              scaleX) only, so the slide runs on the compositor — never layout.
              See .nav-underline in landing.css. */}
          <span
            className="nav-underline"
            style={{
              transform: `translateX(${rect.left}px) scaleX(${rect.width / 100})`,
              opacity: rect.opacity,
            }}
            aria-hidden="true"
          />
        </nav>
        <div className="nav-spacer" />
        <div className="nav-actions">
          <div className="seg" role="group" aria-label="Language">
            <button type="button" aria-pressed={currentLang === 'en'} className={currentLang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            <button type="button" aria-pressed={currentLang === 'es'} className={currentLang === 'es' ? 'active' : ''} onClick={() => setLang('es')}>ES</button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <a className="icon-btn nav-gh" href={GH_URL} target="_blank" rel="noreferrer" aria-label="GitHub">
            <IconGitHub />
          </a>
          {/* #186 — "Para devs" sidekick. Lives in the actions row (not in
              the centre tabs) so the centre row stays product-focused. The
              hash anchor points at the dev-zone container in LandingPage. */}
          <a className="nav-devs-link" href="#para-devs">
            {t('nav.forDevs')}
          </a>
          {/* #738 — primary nav CTA scrolls to the in-page #downloads
              section (pick your OS) rather than the GitHub repo, so a
              non-dev visitor lands on a friendly funnel, not raw source.
              GitHub stays reachable via the icon link to the left. The
              landing never links into the stubbed SPA mock. */}
          <a
            className="btn btn-primary"
            href="#downloads"
            style={{ marginLeft: 4 }}
          >
            {t('nav.cta')}
            <IconArrow />
          </a>
          {/* Hamburger — only rendered ≤720px (CSS). Toggles the slide-down. */}
          <button
            type="button"
            className="icon-btn nav-burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="nav-mobile-panel"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>
      {/* Mobile slide-down menu (#716). Restores the centre links, EN/ES seg
          and "Para devs" link for touch. Compositor-safe (transform+opacity);
          `visibility` keeps the links out of the tab order when closed. */}
      <div id="nav-mobile-panel" className="nav-mobile" data-open={menuOpen || undefined}>
        <div className="lf-container">
          <nav className="nav-mobile-links" aria-label={currentLang === 'es' ? 'Secciones' : 'Sections'}>
            {NAV_SECTIONS.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={active === id ? 'page' : undefined}
                className={active === id ? 'active' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {t(`nav.${NAV_LABEL_KEY[id]}`)}
              </a>
            ))}
            <a href="#para-devs" onClick={() => setMenuOpen(false)}>
              {t('nav.forDevs')}
            </a>
          </nav>
          <div className="nav-mobile-row">
            <div className="seg" role="group" aria-label="Language">
              <button type="button" aria-pressed={currentLang === 'en'} className={currentLang === 'en' ? 'active' : ''} onClick={() => { setLang('en'); setMenuOpen(false); }}>EN</button>
              <button type="button" aria-pressed={currentLang === 'es'} className={currentLang === 'es' ? 'active' : ''} onClick={() => { setLang('es'); setMenuOpen(false); }}>ES</button>
            </div>
            <a className="icon-btn" href={GH_URL} target="_blank" rel="noreferrer" aria-label="GitHub" onClick={() => setMenuOpen(false)}>
              <IconGitHub />
            </a>
          </div>
          <a
            className="btn btn-primary nav-mobile-cta"
            href="#downloads"
            onClick={() => setMenuOpen(false)}
          >
            {t('nav.cta')}
            <IconArrow />
          </a>
        </div>
      </div>
    </header>
  );
}
