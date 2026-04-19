/**
 * Kuja i18n system — runtime translation with RTL support.
 *
 * Translation files are flat key-value JSON (e.g., "nav.dashboard": "Dashboard").
 * The T() function looks up a key, falling back: targetLang → 'en' → raw key.
 * Parameter interpolation: T('auth.welcome_back', { name: 'Fatima' })
 */

import enTranslations from './en.json';
import frTranslations from './fr.json';
import arTranslations from './ar.json';
import esTranslations from './es.json';
import swTranslations from './sw.json';
import soTranslations from './so.json';

type TranslationMap = Record<string, string>;

const translations: Record<string, TranslationMap> = {
  en: enTranslations as TranslationMap,
  fr: frTranslations as TranslationMap,
  ar: arTranslations as TranslationMap,
  es: esTranslations as TranslationMap,
  sw: swTranslations as TranslationMap,
  so: soTranslations as TranslationMap,
};

export const RTL_LANGUAGES = ['ar'];

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang);
}

/**
 * Translate a key with optional parameter interpolation.
 * Falls back: targetLang → 'en' → raw key.
 */
export function translate(
  key: string,
  lang: string = 'en',
  params?: Record<string, string | number>,
): string {
  let text =
    translations[lang]?.[key] ??
    translations.en?.[key] ??
    key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return text;
}

export const supportedLanguages = [
  { code: 'en', label: 'English',    short: 'EN', flag: '\ud83c\uddec\ud83c\udde7' },
  { code: 'fr', label: 'Fran\u00e7ais',   short: 'FR', flag: '\ud83c\uddeb\ud83c\uddf7' },
  { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',     short: 'AR', flag: '\ud83c\uddf8\ud83c\udde6' },
  { code: 'sw', label: 'Kiswahili',  short: 'SW', flag: '\ud83c\uddf0\ud83c\uddea' },
  { code: 'so', label: 'Soomaali',   short: 'SO', flag: '\ud83c\uddf8\ud83c\uddf4' },
  { code: 'es', label: 'Espa\u00f1ol',    short: 'ES', flag: '\ud83c\uddea\ud83c\uddf8' },
];
