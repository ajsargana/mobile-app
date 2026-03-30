import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations } from './translations';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: translations.en },
      es: { translation: translations.es },
      pt: { translation: translations.pt },
      fr: { translation: translations.fr },
      de: { translation: translations.de },
      it: { translation: translations.it },
      nl: { translation: translations.nl },
      ru: { translation: translations.ru },
      uk: { translation: translations.uk },
      pl: { translation: translations.pl },
      ro: { translation: translations.ro },
      tr: { translation: translations.tr },
      ar: { translation: translations.ar },
      fa: { translation: translations.fa },
      hi: { translation: translations.hi },
      bn: { translation: translations.bn },
      ur: { translation: translations.ur },
      zh: { translation: translations.zh },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
