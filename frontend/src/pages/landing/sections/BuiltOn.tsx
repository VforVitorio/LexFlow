import { useTranslation } from 'react-i18next';

interface TerminalLine { type: 'comment' | 'cmd'; text: string; }

export function BuiltOn() {
  const { t } = useTranslation('landing');
  const terminal = t('builtOnTerminal', { returnObjects: true }) as unknown as TerminalLine[];

  return (
    <section className="tight">
      <div className="lf-container">
        <div className="built-on">
          <div>
            <div className="section-eyebrow">
              <span className="dot" />
              <span className="label-caps">{t('builtOnEyebrow')}</span>
            </div>
            <h2 style={{ fontSize: 32, letterSpacing: '-0.025em', lineHeight: 1.1, textWrap: 'balance' }}>{t('builtOnTitle')}</h2>
            <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6 }}>{t('builtOnBody')}</p>
            <a
              className="btn btn-ghost"
              href="https://github.com/legalize-dev/legalize-es"
              target="_blank"
              rel="noreferrer"
              style={{ marginTop: 18, marginLeft: -10 }}
            >
              {t('builtOnCta')}
            </a>
          </div>
          <div className="terminal">
            <div className="terminal-bar">
              <span className="dot r" /><span className="dot y" /><span className="dot g" />
              <span className="name">~/LexFlow</span>
            </div>
            <div className="terminal-body">
              {terminal.map((line, i) => (
                <div key={i}>
                  {line.type === 'comment'
                    ? <span className="comment">{line.text}</span>
                    : <><span className="prompt">$</span>{line.text}</>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
