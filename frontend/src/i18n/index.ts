import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import landingEn from './locales/en/landing.json';
import landingEs from './locales/es/landing.json';
import commonEn from './locales/en/common.json';
import commonEs from './locales/es/common.json';

export const SUPPORTED_LANGS = ['es', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { landing: landingEn, common: commonEn },
      es: { landing: landingEs, common: commonEs },
    },
    fallbackLng: 'es',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common', 'landing'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lexflow.lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
