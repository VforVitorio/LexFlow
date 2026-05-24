import { useTranslation } from 'react-i18next';
import { IconGitHub } from '../icons';

/**
 * "Meet the authors" section — VforVitorio + Santisoutoo.
 *
 * Layout idiom borrowed from f1stratlab-web's `AboutAuthor`
 * (docs/_review/landing-f1stratlab-animations-2026-05-23.md, F12): round
 * avatar with a soft indigo ring, short bio, icon-link "cards" that lift on
 * hover.  All copy lives in i18n under `landing.authors` so the section
 * stays bilingual without code edits.
 */

interface Author {
  login: string;
  name: string;
  role: string;
  bio: string;
}

export function Authors() {
  const { t } = useTranslation('landing');
  const authors = t('authors.list', { returnObjects: true }) as unknown as Author[];

  return (
    <section id="authors" className="tight">
      <div className="lf-container">
        <div className="section-eyebrow">
          <span className="dot" />
          <span className="label-caps">{t('authors.eyebrow')}</span>
        </div>
        <h2 className="section-title section-title-warm">{t('authors.title')}</h2>
        <p className="section-sub">{t('authors.sub')}</p>

        <div className="authors-grid">
          {authors.map((a) => (
            <article key={a.login} className="author-card">
              <div className="author-avatar-wrap">
                <img
                  className="author-avatar"
                  src={`https://avatars.githubusercontent.com/${a.login}`}
                  alt={`Avatar de ${a.name}`}
                  loading="lazy"
                  width={88}
                  height={88}
                />
              </div>
              <div className="author-body">
                <h3 className="author-name">{a.name}</h3>
                <div className="author-role label-caps">{a.role}</div>
                <p className="author-bio">{a.bio}</p>
                <div className="author-links">
                  <a
                    className="author-link"
                    href={`https://github.com/${a.login}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconGitHub />
                    <span>@{a.login}</span>
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
