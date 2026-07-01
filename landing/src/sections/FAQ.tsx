import { useTranslation } from 'react-i18next';
import { SectionEyebrow } from '../components/SectionEyebrow';

/**
 * FAQ section — structured Q&A for AI citability (GEO) and user orientation.
 *
 * Six questions covering identity, pricing, data source, offline capability,
 * supported AI models and OS compatibility. The copy is intentionally
 * definitional so AI search engines (ChatGPT, Perplexity, Google AI Overviews)
 * can quote or summarise individual answers accurately.
 *
 * Renders as native <details>/<summary> elements: the answer text is always in
 * the DOM (good for crawlers and the accessibility tree), the disclosure state
 * lives in the browser (no JS, keyboard- and AT-native), and collapsed content
 * is hidden the standard way instead of via a stripped-from-the-a11y-tree
 * `hidden` attribute. All copy lives in i18n under `landing.faq`.
 */

interface FaqItem {
  q: string;
  a: string;
}

export function FAQ() {
  const { t } = useTranslation('landing');
  const items = t('faq.items', { returnObjects: true }) as unknown as FaqItem[];

  return (
    <section id="faq" className="tight">
      <div className="lf-container">
        <SectionEyebrow label={t('faq.eyebrow')} />
        <h2 className="section-title">{t('faq.title')}</h2>

        <div className="faq-list">
          {items.map((item, index) => (
            <details key={index} className="faq-item">
              <summary className="faq-question">
                <span>{item.q}</span>
                <span className="faq-chevron" aria-hidden="true" />
              </summary>
              <div className="faq-answer">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
