import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconArrow } from '../icons';

/**
 * Landing-page downloads section (#129).
 *
 * Three OS cards (Windows / macOS / Linux). ``navigator.userAgent`` is
 * sniffed once on mount to highlight the visitor's OS — the other two
 * stay clickable so anyone on Linux looking for a friend's Windows
 * build can still find it.
 *
 * Until real release artifacts exist (#125/#127/#128), every CTA
 * points at the GitHub Releases page. release-please already
 * publishes the changelog there, so visitors get something useful
 * even before the first packaged build.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * * Release URLs (per-OS direct binaries) → ``_OS_DEFINITIONS``.
 * * Add a new architecture row             → extend the card's
 *                                            ``arch`` array.
 * * Detection rule for a new platform      → :func:`_detectOs`.
 */

type OsKey = 'windows' | 'macos' | 'linux';

const RELEASES_URL = 'https://github.com/VforVitorio/LexFlow/releases/latest';

interface OsDefinition {
  key: OsKey;
  arch: string[];
  /** Direct download URL when packaged builds exist; null falls back to releases page. */
  binaryUrl: string | null;
}

const _OS_DEFINITIONS: OsDefinition[] = [
  { key: 'windows', arch: ['x64'], binaryUrl: null },
  { key: 'macos', arch: ['Apple Silicon', 'Intel'], binaryUrl: null },
  { key: 'linux', arch: ['x86_64'], binaryUrl: null },
];

function _detectOs(): OsKey | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  // Order matters: macOS often contains the substring "Mac" but also
  // sometimes ships with "Linux" markers on hybrid setups; check the
  // most specific platform first.
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua) && !/Android/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return null;
}

export function Downloads() {
  const { t } = useTranslation('landing');
  const [detectedOs, setDetectedOs] = useState<OsKey | null>(null);

  useEffect(() => {
    setDetectedOs(_detectOs());
  }, []);

  return (
    <section id="downloads" className="tight">
      <div className="lf-container">
        <div className="section-eyebrow" style={{ justifyContent: 'center' }}>
          <span className="dot" />
          <span className="label-caps">{t('downloads.eyebrow')}</span>
        </div>
        <h2 className="section-title section-title-accent" style={{ textAlign: 'center', marginInline: 'auto' }}>
          {t('downloads.title')}
        </h2>
        <p style={{ textAlign: 'center', maxWidth: '40rem', margin: '0.5rem auto 1.5rem' }}>
          {t('downloads.subtitle')}
        </p>

        <div className="downloads-grid">
          {_OS_DEFINITIONS.map((os) => {
            const isPrimary = detectedOs === os.key;
            const href = os.binaryUrl ?? RELEASES_URL;
            return (
              <a
                key={os.key}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={`download-card${isPrimary ? ' download-card--primary' : ''}`}
                aria-current={isPrimary ? 'true' : undefined}
              >
                <span className="download-card__os">{t(`downloads.os.${os.key}.name`)}</span>
                <span className="download-card__arch">{os.arch.join(' · ')}</span>
                <span className="download-card__cta">
                  {isPrimary ? t('downloads.detectedCta') : t('downloads.cta')}
                  <IconArrow />
                </span>
              </a>
            );
          })}
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem', opacity: 0.7 }}>
          {t('downloads.fallbackPre')}{' '}
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">
            {t('downloads.fallbackLink')}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
