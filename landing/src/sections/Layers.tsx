import { type ReactNode, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@/i18n';
import { ApiFeature, type LayerCopy } from '../mocks/ApiFeature';
import { GraphPreview } from '../previews/GraphPreview';
import { ChatPreview } from '../previews/ChatPreview';
import { DashboardPreview } from '../previews/DashboardPreview';

interface Props { lang: Lang; }

function renderBold(str: string): ReactNode[] {
  return str.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**')
      ? <strong key={i} style={{ color: 'hsl(var(--fg))', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p}</Fragment>
  );
}

/**
 * Each card pairs a problem statement (from i18n) with a landing-native
 * preview that mirrors the matching SPA page. Previews use mock data
 * inline and the landing's CSS tokens — no Tailwind, no TanStack Query
 * — so the marketing bundle stays small and visually consistent.
 */
function LayerArt({ idx, lang }: { idx: number; lang: Lang }) {
  if (idx === 1) return <GraphPreview lang={lang} />;
  if (idx === 2) return <ChatPreview lang={lang} />;
  return <DashboardPreview lang={lang} />;
}

export function Layers({ lang }: Props) {
  const { t } = useTranslation('landing');
  const layers = t('layers', { returnObjects: true }) as unknown as LayerCopy[];

  // Feature cards are illustrative, not navigational. A single explicit
  // "Try the demo" CTA in the hero / nav / CTA section is the only way into
  // the SPA — clicking on a mockup here would land the visitor in a stubbed
  // page (GraphPage / ChatPage running on mock data) and confuse them.
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
                  {l.stack && l.stack.length > 0 && (
                    <ul className="feature-stack-chips" aria-label="Stack">
                      {l.stack.map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  )}
                </div>
                <div className="feature-art-wrap lf-hint" aria-hidden="true">
                  {/* #160 — mobile hint nudge (only renders < 760 px). */}
                  <LayerArt idx={i} lang={lang} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
