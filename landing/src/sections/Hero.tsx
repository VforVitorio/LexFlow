import { useTranslation } from 'react-i18next';
import { GH_URL, IconArrow, IconGitHub } from '../icons';

/**
 * Hero — single centred column, f1stratlab-style.
 *
 * The previous two-column layout shipped a `<HeroGraph />` mockup on the
 * right that mixed law metadata ("LOPDGDD") with backend stack labels
 * ("Python 3.12 · FastAPI · 6 enlaces") in the same floating tooltip — it
 * read as noise, not as a hook. We dropped the mock entirely and copied
 * the f1stratlab idiom: a long horizontal eyebrow, a big gradient-clipped
 * H1, sub-line, CTAs, and the small stack-meta dots underneath. Backdrop
 * layers (halo + masked grid) carry the visual weight on their own.
 */
export function Hero() {
  const { t } = useTranslation('landing');
  // Release tag is baked at build time by deploy-landing.yml (#740), so there's
  // no runtime fetch to api.github.com. Falls back to the translated status
  // string in local/dev builds where VITE_LATEST_TAG is unset.
  const statusLabel = import.meta.env.VITE_LATEST_TAG?.trim() || t('hero.status');
  return (
    <section className="hero" id="top">
      {/* #150 — backdrop layers. pointer-events:none so content above stays
          clickable. Sit at z-index 0; the .lf-container is bumped to 1.  */}
      <div className="hero-halo" aria-hidden="true" />
      <div className="hero-grid-lines" aria-hidden="true" />
      <div className="lf-container hero-centered">
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
          <span className="lead">{t('hero.title1')}</span>
          <br />
          <span className="accent">{t('hero.title2')}</span>
        </h1>
        <p className="hero-sub">{t('hero.sub')}</p>
        <div className="hero-cta">
          {/* #738 — primary CTA scrolls to the in-page #downloads section
              (honest "try it" funnel: pick your OS) instead of dropping a
              non-dev visitor straight onto the GitHub repo. GitHub stays one
              click away via the secondary button. */}
          <a className="btn btn-primary btn-lg" href="#downloads">
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
          <span><span className="lf-dot lf-dot-v" /> {t('hero.meta2')}</span>
          <span><span className="lf-dot lf-dot-b" /> {t('hero.meta3')}</span>
        </div>
      </div>
    </section>
  );
}
