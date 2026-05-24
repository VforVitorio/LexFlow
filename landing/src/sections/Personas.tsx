import { useTranslation } from 'react-i18next';

/**
 * #181 — "Para quién es esto" / "Who this is for".
 *
 * Four short persona cards between the hero and the product/problem deck.
 * Reinforces the user-first reorientation (#180): the landing leads with
 * "you" before it talks about API/Graph/Chat layers. Each card is
 * deliberately text-only — no avatars, no fake names. The label-caps
 * eyebrow plus a single problem statement does the work.
 *
 * Cards stack into a `.personas-grid` (4-col → 2-col → 1-col) and pick up
 * the spotlight hover treatment from `.spotlight-card` (added by the cozy
 * animation layer). When the spotlight class is absent the cards still
 * render correctly — the lift+border-darken is a separate :hover rule.
 */

interface Persona {
  icon: string;
  who: string;
  pain: string;
}

export function Personas() {
  const { t } = useTranslation('landing');
  const items = t('personas.list', { returnObjects: true }) as unknown as Persona[];

  return (
    <section id="personas" className="tight">
      <div className="lf-container">
        <div className="section-eyebrow">
          <span className="dot" />
          <span className="label-caps">{t('personas.eyebrow')}</span>
        </div>
        <h2 className="section-title">{t('personas.title')}</h2>
        <p className="section-sub">{t('personas.sub')}</p>
        <div className="personas-grid">
          {items.map((p) => (
            <article key={p.who} className="persona-card spotlight-card">
              <div className="persona-icon" aria-hidden="true">{p.icon}</div>
              <h3 className="persona-who">{p.who}</h3>
              <p className="persona-pain">{p.pain}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
