import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS, type Lang } from '@/i18n';
import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { StatBar } from './sections/StatBar';
import { Personas } from './sections/Personas';
import { Layers } from './sections/Layers';
import { UserFlow } from './sections/UserFlow';
import { BuiltOn } from './sections/BuiltOn';
import { PoweredBy } from './sections/PoweredBy';
import { Stack } from './sections/Stack';
import { Roadmap } from './sections/Roadmap';
import { CTA } from './sections/CTA';
import { Authors } from './sections/Authors';
import { HowItWorks } from './sections/HowItWorks';
import { Footer } from './sections/Footer';
import { RevealSection } from './components/RevealSection';
import './landing.css';

/**
 * Public marketing landing.
 *
 * Mounts outside the AppShell, so the left rail / TopBar are absent.
 * All landing-only CSS lives under `.landing-root` so it can't bleed
 * into the rest of the app when the user navigates away.
 *
 * --- ORDER (post #180 reorientation) ---
 * Hero · StatBar — first fold, value prop in human language.
 * Personas         — for whom (#181).
 * Layers           — what it solves, framed as 4 user problems (#182).
 * UserFlow         — how you use it, 3 steps, no code (#183).
 * Authors · CTA    — close on people + invitation.
 * <div #para-devs> — dev-tone wrapper (#184). Stack, BuiltOn, HowItWorks,
 *                    PoweredBy, Roadmap live here with reduced visual
 *                    weight so non-dev visitors can ignore the section.
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
        <RevealSection><StatBar /></RevealSection>
        <RevealSection><Personas /></RevealSection>
        <RevealSection><Layers lang={lang} /></RevealSection>
        <RevealSection><UserFlow /></RevealSection>
        <RevealSection><Authors /></RevealSection>
        <RevealSection><CTA /></RevealSection>

        {/* "Para devs" zone (#184). Same components as before but wrapped in
            a class that pulls down the visual hierarchy: smaller headings,
            no halo backdrop, lighter eyebrows. Anchor target for the small
            nav-actions "Para devs" link (#186). */}
        <div id="para-devs" className="para-devs">
          <RevealSection><Stack /></RevealSection>
          <RevealSection><HowItWorks /></RevealSection>
          <RevealSection><BuiltOn /></RevealSection>
          <RevealSection><PoweredBy /></RevealSection>
          <RevealSection><Roadmap /></RevealSection>
        </div>
      </main>
      <Footer />
    </div>
  );
}
