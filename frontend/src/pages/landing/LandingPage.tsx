import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, type Lang } from '@/i18n';
import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { StatBar } from './sections/StatBar';
import { Layers } from './sections/Layers';
import { BuiltOn } from './sections/BuiltOn';
import { PoweredBy } from './sections/PoweredBy';
import { Stack } from './sections/Stack';
import { Roadmap } from './sections/Roadmap';
import { CTA } from './sections/CTA';
import { Authors } from './sections/Authors';
import { Footer } from './sections/Footer';
import './landing.css';

/**
 * Public marketing landing.
 *
 * Mounts outside the AppShell, so the left rail / TopBar are absent.
 * All landing-only CSS lives under `.landing-root` so it can't bleed
 * into the rest of the app when the user navigates away.
 */
export function LandingPage() {
  const { i18n } = useTranslation('landing');
  const lang: Lang = (SUPPORTED_LANGS.includes(i18n.resolvedLanguage as Lang)
    ? (i18n.resolvedLanguage as Lang)
    : 'es');

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    document.title = lang === 'es'
      ? 'LexFlow — Legislación española, viva y navegable'
      : 'LexFlow — Spanish legislation, alive and navigable';
  }, [lang]);

  return (
    <div className="landing-root">
      <Nav />
      <main>
        <Hero />
        <StatBar />
        <Layers lang={lang} />
        <BuiltOn />
        <PoweredBy />
        <Stack />
        <Roadmap />
        <Authors />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
