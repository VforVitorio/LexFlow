import { useState } from 'react';

/**
 * #159 — Terminal-chrome code block with copy-to-clipboard.
 *
 * macOS-style chrome (three dots + optional title), syntax tinting via
 * `c-comment` / `c-cmd` / `c-str` / `c-flag` class spans on the lines, and
 * a copy button in the upper-right that:
 *  - shows a "Copied" tick for 1.6 s
 *  - scales to 0.94 on press
 *
 * Pure HTML/CSS — no Prism, no Shiki, no JS highlighter. Lines are
 * pre-tagged by the caller, so we don't even need to parse them.
 */

export type TerminalLineType = 'comment' | 'cmd' | 'str' | 'flag' | 'plain';

export interface TerminalLine {
  type: TerminalLineType;
  text: string;
}

interface Props {
  title?: string;
  lines: TerminalLine[];
  /** Override the text shown by the copy button (defaults to `cmd` lines). */
  copyText?: string;
}

function renderLine(line: TerminalLine, key: number) {
  switch (line.type) {
    case 'comment':
      return <div key={key}><span className="c-comment">{line.text}</span></div>;
    case 'cmd':
      return (
        <div key={key}>
          <span className="c-cmd">$ </span>
          <span>{line.text}</span>
        </div>
      );
    case 'str':
      return <div key={key}><span className="c-str">{line.text}</span></div>;
    case 'flag':
      return <div key={key}><span className="c-flag">{line.text}</span></div>;
    default:
      return <div key={key}>{line.text}</div>;
  }
}

export function TerminalBlock({ title = '~/lexflow', lines, copyText }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const txt = copyText ?? lines.filter((l) => l.type === 'cmd').map((l) => l.text).join('\n');
    if (!txt) return;
    void navigator.clipboard.writeText(txt).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="lf-term">
      <div className="lf-term-chrome">
        <span className="lf-term-dots" aria-hidden="true">
          <span /><span /><span />
        </span>
        <span className="lf-term-title">{title}</span>
        <span className="lf-term-spacer" />
        <button
          type="button"
          className="lf-term-copy"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy commands to clipboard'}
          data-copied={copied}
        >
          {copied ? (
            // simple tick
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            // copy icon
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M3.5 10.5V3.5C3.5 2.7 4.2 2 5 2H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
      <pre className="lf-term-body">{lines.map(renderLine)}</pre>
    </div>
  );
}
