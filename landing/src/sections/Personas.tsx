import { useTranslation } from 'react-i18next';
import { PERSONA_ICONS } from '../icons';
import { SectionEyebrow } from '../components/SectionEyebrow';

/**
 * #181 — "Para quién es esto" / "Who this is for".
 *
 * Four persona cards between the hero and the product/problem deck.
 * Reinforces the user-first reorientation (#180): the landing leads
 * with "you" before it talks about API/Graph/Chat layers.
 *
 * Icons are lucide-flavoured SVGs from `icons.tsx`; the i18n `icon` key
 * names the slot (scale / book / newspaper / shield). The card layout
 * centres the icon on a soft violet halo above the title — same idiom
 * f1stratlab uses on its persona/highlights row.
 */

interface Persona {
  icon: keyof typeof PERSONA_ICONS;
  who: string;
  pain: string;
}

export function Personas() {
  const { t } = useTranslation('landing');
  const items = t('personas.list', { returnObjects: true }) as unknown as Persona[];

  return (
    <section id="personas" className="tight">
      <div className="lf-container">
        <SectionEyebrow label={t('personas.eyebrow')} />
        <h2 className="section-title">{t('personas.title')}</h2>
        <p className="section-sub">{t('personas.sub')}</p>
        <div className="personas-grid">
          {items.map((p) => (
            <article key={p.who} className="persona-card spotlight-card">
              <div className="persona-icon-wrap" aria-hidden="true">
                <span className="persona-icon">{PERSONA_ICONS[p.icon]}</span>
              </div>
              <h3 className="persona-who">{p.who}</h3>
              <p className="persona-pain">{p.pain}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
