//! react-i18next setup. Source of truth for the active language is the Rust
//! config (~/.cue/config.toml). We initialise with 'en' synchronously so the
//! first paint is never empty, then `useLanguageBootstrap` swaps to the
//! persisted language once Tauri returns it.

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations, LANGUAGES, type Language, isLanguage } from '@cue/shared';

const resources = Object.fromEntries(
  LANGUAGES.map((lng) => [lng, { translation: translations[lng] }]),
);

void i18next.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { isLanguage };
export type { Language };

export function setLanguage(lang: Language) {
  void i18next.changeLanguage(lang);
  // Direction is read off <html dir> by Tailwind logical utilities + browser
  // form controls. Setting it here keeps the overlay correct when the user
  // picks Arabic.
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}
