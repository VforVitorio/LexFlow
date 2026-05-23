import { type ReactNode, useState } from 'react';
import type { Lang } from '@/i18n';
import { ENDPOINTS } from './apiEndpoints';

interface Props {
  lang: Lang;
  activeIdx?: number;
}

const SENTINEL = '';

function highlight(raw: string): ReactNode[] {
  return raw.split('\n').map((line, i) => {
    let rest = line;
    rest = rest.replace(/("[^"]+")(\s*:)/g, (_, k, c) => `${SENTINEL}K${k}${SENTINEL}${c}`);
    rest = rest.replace(/:\s*("[^"]*")/g, (m, s) => m.replace(s, `${SENTINEL}S${s}${SENTINEL}`));
    rest = rest.replace(/:\s*(-?\d+(?:\.\d+)?)/g, (m, n) => m.replace(n, `${SENTINEL}N${n}${SENTINEL}`));
    rest = rest.replace(/:\s*(true|false|null)/g, (m, b) => m.replace(b, `${SENTINEL}B${b}${SENTINEL}`));
    const parts: ReactNode[] = rest.split(SENTINEL).map((seg, j) => {
      if (seg.startsWith('K')) return <span key={j} style={{ color: 'hsl(252, 95%, 76%)' }}>{seg.slice(1)}</span>;
      if (seg.startsWith('S')) return <span key={j} style={{ color: 'hsl(152, 60%, 50%)' }}>{seg.slice(1)}</span>;
      if (seg.startsWith('N')) return <span key={j} style={{ color: 'hsl(217, 91%, 60%)' }}>{seg.slice(1)}</span>;
      if (seg.startsWith('B')) return <span key={j} style={{ color: 'hsl(36, 95%, 60%)' }}>{seg.slice(1)}</span>;
      return seg;
    });
    return <div key={i}>{parts}</div>;
  });
}

export function ApiMockup({ lang, activeIdx = 1 }: Props) {
  const list = ENDPOINTS[lang] ?? ENDPOINTS.en;
  const ep = list[activeIdx] ?? list[0];
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(ep.json).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const copyLabel = copied ? (lang === 'es' ? 'Copiado' : 'Copied') : (lang === 'es' ? 'Copiar' : 'Copy');

  return (
    <div className="lf-mock lf-mock-api">
      <div className="lf-api-tabs">
        <span className="lf-api-tab">{ep.method}</span>
        <code className="lf-api-path">{ep.path}</code>
        <span className="lf-api-status">200 OK</span>
        <button className="lf-copy-btn" onClick={handleCopy} aria-label="Copy response">
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          <span style={{ fontSize: 10.5, fontWeight: 600 }}>{copyLabel}</span>
        </button>
      </div>
      <div className="lf-api-body">
        <pre style={{ margin: 0 }}>{highlight(ep.json)}</pre>
      </div>
    </div>
  );
}
