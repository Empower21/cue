'use client';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { translations, LANGUAGES, isLanguage, type Language } from '@cue/shared';

// Initialise i18next at module-load time on BOTH server and client. The
// `'use client'` directive doesn't stop Next.js from running this module
// during the server-render pass — and if i18next hasn't been .init()ed
// there, t('app.title') returns the literal key "app.title" instead of
// "cue". That mismatch between SSR (key) and CSR (translated) is what
// causes Next 15's hydration error.
//
// First paint always uses 'en' so SSR HTML and CSR first paint agree
// down to the byte. After mount, a useEffect in the page swaps to the
// user's browser/persisted language — post-hydration changes don't
// trigger the mismatch warning.

const resources = Object.fromEntries(
  LANGUAGES.map((lng) => [lng, { translation: translations[lng] }]),
);

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
    // Avoid suspense — we render synchronously on the server.
    react: { useSuspense: false },
  });
}

export function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const candidate of candidates) {
    const short = candidate.split('-')[0]?.toLowerCase();
    if (short && isLanguage(short)) return short;
  }
  return 'en';
}

export { isLanguage };
export type { Language };
