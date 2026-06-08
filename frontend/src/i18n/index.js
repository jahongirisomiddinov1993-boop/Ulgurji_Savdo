import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import uzLatin from './uz-latin.json';
import uzCyrillic from './uz-cyrillic.json';
import ru from './ru.json';

const resources = {
  'uz-latin':    { translation: uzLatin },
  'uz-cyrillic': { translation: uzCyrillic },
  ru:            { translation: ru },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'uz-latin',
    supportedLngs: ['uz-latin', 'uz-cyrillic', 'ru'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app_lang',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export const LANGUAGES = [
  { code: 'uz-latin',    label: 'O\'zbekcha',  flag: '🇺🇿' },
  { code: 'uz-cyrillic', label: 'Ўзбекча',     flag: '🇺🇿' },
  { code: 'ru',          label: 'Русский',     flag: '🇷🇺' },
];

export default i18n;
