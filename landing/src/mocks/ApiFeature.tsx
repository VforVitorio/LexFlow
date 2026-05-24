import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/i18n';
import { SearchPreview } from '../previews/SearchPreview';

export interface LayerCopy {
  num: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  /** #182 — small stack chips at the bottom of each card. */
  stack?: string[];
  /** Deprecated — preserved for i18n schema parity. Cards no longer link into the SPA. */
  linkLabel?: string;
}

interface Props {
  layer: LayerCopy;
  lang: Lang;
}

/**
 * First feature card — "Find any law without opening the BOE".
 *
 * The user hovers a tag chip on the left and watches the law list on
 * the right re-filter to laws carrying that tag. While the cursor is
 * idle the chip list auto-rotates every {@link ROTATE_MS}, same idiom
 * f1stratlab uses on its "Models" panel.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Tag → law mapping: landing/src/previews/SearchPreview.tsx (LAWS_* arrays)
 * Styles:            landing/src/landing.css   .lf-prev-search-*, .lf-tags-*
 */
const ROTATE_MS = 3800;

interface TagRow { id: string; label: { es: string; en: string }; count: number; }
const TAGS: TagRow[] = [
  { id: 'laboral',        label: { es: 'laboral',        en: 'labour' },          count: 142 },
  { id: 'fiscal',         label: { es: 'fiscal',         en: 'tax' },             count: 98  },
  { id: 'datos',          label: { es: 'datos',          en: 'data' },            count: 76  },
  { id: 'constitucional', label: { es: 'constitucional', en: 'constitutional' },  count: 41  },
];

export function ApiFeature({ layer, lang }: Props) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  ).current;

  useEffect(() => {
    if (paused || reduceMotion) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % TAGS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, reduceMotion]);

  // SearchPreview filters on the English tag id, so the same data drives
  // both locales — only the chip label flips.
  const activeTag = lang === 'es' ? TAGS[active].id : TAGS[active].label.en;

  return (
    <article className="feature">
      <div className="feature-copy">
        <div className="feature-num">{layer.num}</div>
        <div className="label-caps" style={{ marginBottom: 8 }}>{layer.kicker}</div>
        <h3>{layer.title}</h3>
        <p>{layer.body}</p>
        <div
          className="lf-tags"
          role="tablist"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {TAGS.map((tag, i) => (
            <button
              key={tag.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`lf-tag${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <span className="lf-tag-hash">#</span>
              <span className="lf-tag-name">{tag.label[lang] ?? tag.label.en}</span>
              <span className="lf-tag-count">{tag.count}</span>
            </button>
          ))}
        </div>
        {layer.stack && layer.stack.length > 0 && (
          <ul className="feature-stack-chips" aria-label="Stack">
            {layer.stack.map((s) => <li key={s}>{s}</li>)}
          </ul>
        )}
      </div>
      <div className="feature-art">
        <SearchPreview lang={lang} activeTag={activeTag} />
      </div>
    </article>
  );
}
