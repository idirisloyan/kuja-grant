/**
 * Locale helpers — map our internal language codes to BCP-47 locale tags
 * suitable for Intl.DateTimeFormat / Intl.NumberFormat.
 */

export function langToLocale(lang: string): string {
  const map: Record<string, string> = {
    en: 'en-US',
    fr: 'fr-FR',
    ar: 'ar',
    es: 'es-ES',
    sw: 'sw-KE',
    so: 'so',
  };
  return map[lang] ?? 'en-US';
}
