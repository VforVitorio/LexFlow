import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import commonEs from './locales/es/common.json';

export const SUPPORTED_LANGS = ['es', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

// The SPA owns only the `common` namespace. The marketing landing's `landing`
// namespace lives in the standalone landing project under ../../landing — do
// not register it here.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: commonEn },
      es: { common: commonEs },
    },
    fallbackLng: 'es',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lexflow.lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
