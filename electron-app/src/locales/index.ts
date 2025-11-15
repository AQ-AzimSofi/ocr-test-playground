import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import Japanese translations
import jaCommon from './ja/common.json';
import jaSettings from './ja/settings.json';
import jaModeA from './ja/modeA.json';
import jaModeB from './ja/modeB.json';
import jaFloorPlan from './ja/floorPlan.json';
import jaProcessors from './ja/processors.json';
import jaErrors from './ja/errors.json';

// Import English translations
import enCommon from './en/common.json';
import enSettings from './en/settings.json';
import enModeA from './en/modeA.json';
import enModeB from './en/modeB.json';
import enFloorPlan from './en/floorPlan.json';
import enProcessors from './en/processors.json';
import enErrors from './en/errors.json';

const getSavedLanguage = (): string => {
  try {
    return localStorage.getItem('language') || 'ja';
  } catch {
    return 'ja';
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: {
        common: jaCommon,
        settings: jaSettings,
        modeA: jaModeA,
        modeB: jaModeB,
        floorPlan: jaFloorPlan,
        processors: jaProcessors,
        errors: jaErrors,
      },
      en: {
        common: enCommon,
        settings: enSettings,
        modeA: enModeA,
        modeB: enModeB,
        floorPlan: enFloorPlan,
        processors: enProcessors,
        errors: enErrors,
      },
    },
    lng: getSavedLanguage(), // Japanese as default
    fallbackLng: 'en', // Fallback to English
    ns: ['common', 'settings', 'modeA', 'modeB', 'floorPlan', 'processors', 'errors'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false, // Disable suspense for Electron compatibility
    },
  });

export default i18n;
