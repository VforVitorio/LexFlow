import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * FAQ section — structured Q&A for AI citability (GEO) and user orientation.
 *
 * Six questions covering identity, pricing, data source, offline capability,
 * supported AI models and OS compatibility. The copy is intentionally
 * definitional so AI search engines (ChatGPT, Perplexity, Google AI Overviews)
 * can quote or summarise individual answers accurately.
 *
 * All copy lives in i18n under `landing.faq` — no hard-coded strings here.
 * Renders as a `<details>` / `<summary>` accordion so the full answer text is
 * always in the DOM (good for crawlers) while keeping the UI compact.
 */

interface FaqItem {
  q: string;
  a: string;
}

export function FAQ() {
  const { t } = useTranslation('landing');
  const items = t('faq.items', { returnObjects: true }) as unknown as FaqItem[];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index);
  }

  return (
    <section id="faq" className="tight">
      <div className="lf-container">
        <div className="section-eyebrow">
          <span className="dot" />
          <span className="label-caps">{t('faq.eyebrow')}</span>
        </div>
        <h2 className="section-title">{t('faq.title')}</h2>

        <dl className="faq-list">
          {items.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className={`faq-item${isOpen ? ' faq-item--open' : ''}`}>
                <dt>
                  <button
                    className="faq-question"
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${index}`}
                    onClick={() => toggle(index)}
                  >
                    <span>{item.q}</span>
                    <span className="faq-chevron" aria-hidden="true">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                </dt>
                <dd
                  id={`faq-answer-${index}`}
                  className="faq-answer"
                  hidden={!isOpen}
                >
                  {item.a}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
