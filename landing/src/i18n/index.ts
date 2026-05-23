import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import landingEn from './locales/en/landing.json';
import landingEs from './locales/es/landing.json';

export const SUPPORTED_LANGS = ['es', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { landing: landingEn },
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

export default i18n;
