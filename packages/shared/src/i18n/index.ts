import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import zh from './zh.json';
import hi from './hi.json';
import ar from './ar.json';
import it from './it.json';
import de from './de.json';
import nl from './nl.json';

export const translations = { en, es, fr, zh, hi, ar, it, de, nl } as const;

export type Language = keyof typeof translations;

export type Translations = typeof en;

export const LANGUAGES: Language[] = ['en', 'es', 'fr', 'zh', 'hi', 'ar', 'it', 'de', 'nl'];

/** Languages whose script is read right-to-left. */
export const RTL_LANGUAGES: ReadonlySet<Language> = new Set(['ar']);

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as string[]).includes(value);
}
