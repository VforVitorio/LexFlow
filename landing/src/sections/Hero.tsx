import { useTranslation } from 'react-i18next';
import { HeroGraph } from '../mocks/HeroGraph';
import { GH_URL, IconArrow, IconGitHub } from '../icons';
import { useLatestRelease } from '../hooks/useLatestRelease';

export function Hero() {
  const { t } = useTranslation('landing');
  // Pulled once at session start; tag drives the long horizontal eyebrow's
  // version chip and falls back to the translated status while loading.
  const { tag } = useLatestRelease();
  const statusLabel = tag ?? t('hero.status');
  return (
    <section className="hero" id="top">
      {/* #150 — backdrop layers. pointer-events:none so content above stays
          clickable. Sit at z-index 0; the .lf-container is bumped to 1.  */}
      <div className="hero-halo" aria-hidden="true" />
      <div className="hero-grid-lines" aria-hidden="true" />
      <div className="lf-container hero-grid">
        <div>
          {/* Long horizontal eyebrow (f1stratlab-style). Sits above the H1 as
              a single uppercase mono line with bullet separators. */}
          <div className="hero-eyebrow" aria-label="LexFlow status line">
            <span className="pulse-dot" aria-hidden="true" />
            <span>LEXFLOW</span>
            <span className="hero-eyebrow-sep" aria-hidden="true">·</span>
            <span>LEGAL KNOWLEDGE GRAPH</span>
            <span className="hero-eyebrow-sep" aria-hidden="true">·</span>
            <span>OPEN SOURCE</span>
            <span className="hero-eyebrow-sep" aria-hidden="true">·</span>
            <span>{statusLabel}</span>
          </div>
          <h1>
            {/* First half gradient-clipped (#150). Wrap in .lead so the
                gradient applies; .accent on the next line still wins. */}
            <span className="lead">{t('hero.title1')}</span><br />
            <span className="accent">{t('hero.title2')}</span>
          </h1>
          <p className="hero-sub">{t('hero.sub')}</p>
          <div className="hero-cta">
            {/* Marketing landing is a separate static site from the SPA
                (see main.tsx VITE_BUILD_TARGET). Primary CTA goes to the
                GitHub repo so visitors land on install / releases / source —
                never on a stubbed SPA running on mock data. */}
            <a className="btn btn-primary btn-lg" href={GH_URL} target="_blank" rel="noreferrer">
              {t('hero.ctaPrimary')}
              <IconArrow />
            </a>
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
        <div className="hero-visual lf-hint">
          {/* #160 — `.lf-hint` adds a small bottom-right "→" nudge on
              viewports < 760 px, hinting that the SVG is wider than the
              column. Fades after two cycles. */}
          <HeroGraph />
        </div>
      </div>
    </section>
  );
}
