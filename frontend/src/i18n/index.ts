import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import commonEs from './locales/es/common.json';

export const SUPPORTED_LANGS = ['es', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

// Spanish is the `fallbackLng`, so it must always be present — it ships in
// the main bundle. Every other locale is code-split and fetched on demand
// (see `loadLocale`), keeping the initial JS payload to a single language.
const LAZY_LOADED = new Set<Lang>(['es']);

/**
 * Fetch and register a non-default locale bundle the first time it's needed.
 *
 * The `LAZY_LOADED` guard makes this idempotent: repeated language switches
 * never re-import or re-add a bundle that's already registered.
 */
async function loadLocale(lang: string): Promise<void> {
  if (lang !== 'en' || LAZY_LOADED.has('en')) return;
  const mod = await import('./locales/en/common.json');
  i18n.addResourceBundle('en', 'common', mod.default, true, true);
  LAZY_LOADED.add('en');
}

// The SPA owns only the `common` namespace. The marketing landing's `landing`
// namespace lives in the standalone landing project under ../../landing — do
// not register it here.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { common: commonEs },
    },
    fallbackLng: 'es',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lexflow.lang',
      caches: ['localStorage'],
    },
  })
  .then(() => {
    // If the detected language resolved to a lazy locale, fetch it now so the
    // first paint isn't stuck on the Spanish fallback.
    void loadLocale(i18n.resolvedLanguage ?? i18n.language);
  });

// Fetch the target bundle before each switch so the new language is ready by
// the time React re-renders.
i18n.on('languageChanged', (lang) => {
  void loadLocale(lang);
});

export default i18n;
