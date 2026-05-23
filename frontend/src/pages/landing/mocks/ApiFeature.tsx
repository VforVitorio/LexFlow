import { useState } from 'react';
import type { Lang } from '@/i18n';
import { ENDPOINTS } from './apiEndpoints';
import { ApiMockup } from './ApiMockup';

export interface LayerCopy {
  num: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  /** Deprecated — left in the i18n schema for parity. Feature cards no longer link into the SPA. */
  linkLabel?: string;
}

interface Props {
  layer: LayerCopy;
  lang: Lang;
}

export function ApiFeature({ layer, lang }: Props) {
  const [active, setActive] = useState(1);
  const endpoints = ENDPOINTS[lang] ?? ENDPOINTS.en;

  return (
    <article className="feature">
      <div className="feature-copy">
        <div className="feature-num">{layer.num}</div>
        <div className="label-caps" style={{ marginBottom: 8 }}>{layer.kicker}</div>
        <h3>{layer.title}</h3>
        <p>{layer.body}</p>
        <div className="lf-endpoints" role="tablist">
          {endpoints.map((ep, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`lf-endpoint ${i === active ? 'active' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="lf-endpoint-method">{ep.method}</span>
              <code className="lf-endpoint-path">{ep.path}</code>
              <span className="lf-endpoint-label">{ep.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="feature-art">
        <ApiMockup lang={lang} activeIdx={active} />
      </div>
    </article>
  );
}
