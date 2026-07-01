import { useTranslation } from 'react-i18next';
import { TerminalBlock, type TerminalLine } from '../components/TerminalBlock';
import { SectionEyebrow } from '../components/SectionEyebrow';

export function BuiltOn() {
  const { t } = useTranslation('landing');
  const terminal = t('builtOnTerminal', { returnObjects: true }) as unknown as TerminalLine[];

  return (
    <section className="tight">
      <div className="lf-container">
        <div className="built-on">
          <div>
            <SectionEyebrow label={t('builtOnEyebrow')} />
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
          {/* #159 — migrated from the bespoke .terminal block to the new
              reusable TerminalBlock that ships with a copy-to-clipboard
              button and macOS chrome. The i18n shape stays the same. */}
          <TerminalBlock title="~/LexFlow" lines={terminal} />
        </div>
      </div>
    </section>
  );
}
