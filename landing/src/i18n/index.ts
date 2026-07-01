import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import landingEs from './locales/es/landing.json';

export const SUPPORTED_LANGS = ['es', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

// Only ES (the fallback + prerendered language, see scripts/prerender.mjs) is
// bundled synchronously so the pre-rendered HTML and first paint have it with
// no async gap. EN is pulled on demand via `ensureLang` (#740), so the ~6 KB
// gzip of English copy never ships to the Spanish-speaking primary audience.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { landing: landingEs },
    },
    fallbackLng: 'es',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['landing'],
    defaultNS: 'landing',
    interpolation: { escapeValue: false },
    detection: {
      // `lexflow.landing.lang` is intentionally distinct from the SPA's
      // `lexflow.lang` so the two surfaces stay independent.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lexflow.landing.lang',
      caches: ['localStorage'],
    },
  });

// Explicit per-locale loaders (only the non-bundled ones). A static map keeps
// Vite from also code-splitting the statically-imported ES bundle.
const LAZY_LOADERS: Partial<Record<Lang, () => Promise<{ default: Record<string, unknown> }>>> = {
  en: () => import('./locales/en/landing.json'),
};

/**
 * Ensure a locale's translations are loaded, importing the chunk once.
 *
 * No-op for ES (bundled at init) and for any already-loaded locale, so callers
 * can fire it unconditionally before `changeLanguage`.
 */
export async function ensureLang(lang: Lang): Promise<void> {
  const loader = LAZY_LOADERS[lang];
  if (!loader || i18n.hasResourceBundle(lang, 'landing')) return;
  const mod = await loader();
  i18n.addResourceBundle(lang, 'landing', mod.default, true, true);
}

// A visitor whose browser language resolved to a non-bundled locale (e.g. an
// English browser with no prior choice) hydrates in ES — matching the
// prerendered HTML — then loads and switches to their language once ready.
const detected = i18n.resolvedLanguage as Lang | undefined;
if (detected && detected !== 'es' && SUPPORTED_LANGS.includes(detected)) {
  void ensureLang(detected).then(() => i18n.changeLanguage(detected));
}

export default i18n;
