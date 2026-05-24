import { type ReactNode, Fragment } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * "Vale, pero ¿qué es esto?" — short explainer between Hero and Personas.
 *
 * The hero promises "Spanish law, walked like a graph", which is evocative
 * but doesn't *explain*. This section drops the metaphor and says, in two
 * paragraphs, what LexFlow actually is and what it aims for. A small
 * stat-row below the copy anchors the answer in numbers.
 *
 * Layout is left-aligned to match every other section on the page; the
 * earlier centred version felt different from its neighbours and the user
 * preferred consistency.
 */

interface StatItem { value: string; label: string; }

function renderBold(str: string): ReactNode[] {
  return str.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <Fragment key={i}>{p}</Fragment>
  );
}

export function WhatIs() {
  const { t } = useTranslation('landing');
  const stats = t('whatIs.stats', { returnObjects: true }) as unknown as StatItem[];

  return (
    <section id="what-is" className="tight what-is">
      <div className="lf-container">
        <div className="section-eyebrow">
          <span className="dot" />
          <span className="label-caps">{t('whatIs.eyebrow')}</span>
        </div>
        <h2 className="section-title section-title-accent what-is-title">{t('whatIs.title')}</h2>
        <div className="what-is-body">
          <p>{renderBold(t('whatIs.p1'))}</p>
          <p>{renderBold(t('whatIs.p2'))}</p>
        </div>
        <ul className="what-is-stats">
          {stats.map((s) => (
            <li key={s.label}>
              <span className="what-is-stat-value">{s.value}</span>
              <span className="what-is-stat-label">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
