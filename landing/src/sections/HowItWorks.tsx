import { useTranslation } from 'react-i18next';
import { SectionEyebrow } from '../components/SectionEyebrow';

/**
 * #157 — "How it works" narrative.
 *
 * Originally implemented as a 280vh scroll-pinned section with framer-motion
 * cross-fades. That layout produced visible empty gaps between scenes when
 * the user scrolled past one band but had not yet entered the next, so we
 * replaced it with a plain three-card grid (the same layout the
 * reduced-motion fallback already used). Same content, no scroll trickery.
 */

interface Scene {
  title: string;
  body: string;
}

export function HowItWorks() {
  const { t } = useTranslation('landing');
  const scenes = t('howItWorks.scenes', { returnObjects: true }) as unknown as Scene[];

  return (
    <section id="how" className="hiw-section hiw-static">
      <div className="lf-container">
        <SectionEyebrow label={t('howItWorks.eyebrow')} />
        <h2 className="section-title">{t('howItWorks.title')}</h2>
        <p className="section-sub">{t('howItWorks.sub')}</p>
        <div className="hiw-static-grid">
          {scenes.map((s, i) => (
            <article key={i} className="hiw-static-card">
              <div className="feature-num">{`0${i + 1}`}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
