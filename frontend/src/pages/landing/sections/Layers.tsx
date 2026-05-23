import { type ReactNode, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@/i18n';
import { ApiFeature, type LayerCopy } from '../mocks/ApiFeature';
import { GraphMockup } from '../mocks/GraphMockup';
import { ChatMockup } from '../mocks/ChatMockup';
import { DashboardMockup } from '../mocks/DashboardMockup';

interface Props { lang: Lang; }

// Each non-API feature card links its mockup to the matching in-app surface.
const FEATURE_ROUTES = ['/explorer', '/graph', '/chat', '/dashboards'] as const;

function renderBold(str: string): ReactNode[] {
  return str.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**')
      ? <strong key={i} style={{ color: 'hsl(var(--fg))', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p}</Fragment>
  );
}

function LayerArt({ idx, lang }: { idx: number; lang: Lang }) {
  if (idx === 1) return <GraphMockup lang={lang} />;
  if (idx === 2) return <ChatMockup lang={lang} />;
  return <DashboardMockup lang={lang} />;
}

export function Layers({ lang }: Props) {
  const { t } = useTranslation('landing');
  const layers = t('layers', { returnObjects: true }) as unknown as LayerCopy[];

  return (
    <section id="layers">
      <div className="lf-container">
        <div className="section-eyebrow">
          <span className="dot" />
          <span className="label-caps">{t('layersEyebrow')}</span>
        </div>
        <h2 className="section-title">{t('layersTitle')}</h2>
        <p className="section-sub">{renderBold(t('layersSub'))}</p>
        <div className="features">
          {layers.map((l, i) => {
            if (i === 0) return <ApiFeature key={i} layer={l} lang={lang} />;
            const route = FEATURE_ROUTES[i];
            return (
              <article key={i} className={`feature${i % 2 ? ' reverse' : ''}`}>
                <div className="feature-copy">
                  <div className="feature-num">{l.num}</div>
                  <div className="label-caps" style={{ marginBottom: 8 }}>{l.kicker}</div>
                  <h3>{l.title}</h3>
                  <p>{l.body}</p>
                  <ul className="feature-bullets">
                    {l.bullets.map((b, j) => <li key={j}>{b}</li>)}
                  </ul>
                  {l.linkLabel && (
                    <Link to={route} className="feature-link">{l.linkLabel}</Link>
                  )}
                </div>
                <Link to={route} className="feature-art-link" aria-label={l.title}>
                  <LayerArt idx={i} lang={lang} />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
