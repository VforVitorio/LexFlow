import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/i18n';
import { ENDPOINTS } from './apiEndpoints';
import { ApiMockup } from './ApiMockup';

export interface LayerCopy {
  num: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  /** #182 — tech-stack chips. Demoted from the body copy to a small row of
   *  pills at the bottom of each card so the headline reads as a user
   *  outcome ("Pregúntale al BOE") and the stack ("FastMCP · Ollama")
   *  reads as secondary context. */
  stack?: string[];
  /** Deprecated — left in the i18n schema for parity. Feature cards no longer link into the SPA. */
  linkLabel?: string;
}

interface Props {
  layer: LayerCopy;
  lang: Lang;
}

/** Time between automatic endpoint advances when nobody is hovering. */
const ROTATE_MS = 3800;

/**
 * Stops the auto-rotation while the cursor sits anywhere over the
 * `.lf-endpoints` list. Same idiom f1stratlab uses on its "Models" panel:
 * passive rotation when idle, immediate response on hover.
 */
export function ApiFeature({ layer, lang }: Props) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const endpoints = ENDPOINTS[lang] ?? ENDPOINTS.en;
  const reduceMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  ).current;

  // Auto-rotate the active endpoint while no pointer is hovering and the
  // user has NOT opted out of motion. The interval restarts every time we
  // resume so the user gets a fresh tick instead of an instant flip.
  useEffect(() => {
    if (paused || reduceMotion) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % endpoints.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, endpoints.length, reduceMotion]);

  return (
    <article className="feature">
      <div className="feature-copy">
        <div className="feature-num">{layer.num}</div>
        <div className="label-caps" style={{ marginBottom: 8 }}>{layer.kicker}</div>
        <h3>{layer.title}</h3>
        <p>{layer.body}</p>
        <div
          className="lf-endpoints"
          role="tablist"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {endpoints.map((ep, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`lf-endpoint ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <span className="lf-endpoint-method">{ep.method}</span>
              <code className="lf-endpoint-path">{ep.path}</code>
              <span className="lf-endpoint-label">{ep.label}</span>
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
        <ApiMockup lang={lang} activeIdx={active} />
      </div>
    </article>
  );
}
