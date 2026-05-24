import { useTranslation } from 'react-i18next';
import { GH_URL, IconGitHub, IconArrow } from '../icons';

/**
 * "Para devs" hero banner — sits at the top of the .para-devs zone.
 * Explains LexFlow's stance on open source / contributions in human
 * language so visitors know the dev section isn't just stack porn:
 * it's an invitation. Closes part of #180.
 *
 * Layout-wise this is intentionally calmer than a top-level section:
 * smaller H, smaller padding, no halo. The visual weight comes from
 * the GitHub icon + the violet accent border on the left.
 */
export function DevContrib() {
  const { t } = useTranslation('landing');
  return (
    <section className="dev-contrib">
      <div className="lf-container">
        <div className="dev-contrib-card">
          <div className="dev-contrib-icon" aria-hidden="true"><IconGitHub size={28} /></div>
          <div className="dev-contrib-copy">
            <h2 className="dev-contrib-title">{t('devContrib.title')}</h2>
            <p className="dev-contrib-body">{t('devContrib.body')}</p>
            <ul className="dev-contrib-bullets">
              <li>{t('devContrib.bullet1')}</li>
              <li>{t('devContrib.bullet2')}</li>
              <li>{t('devContrib.bullet3')}</li>
            </ul>
            <a className="btn btn-secondary" href={GH_URL} target="_blank" rel="noreferrer">
              <IconGitHub /> {t('devContrib.cta')} <IconArrow />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
