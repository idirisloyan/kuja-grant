// ============================================================================
// Kuja — Multi-currency formatting (Phase 4 Global South affordances)
// ----------------------------------------------------------------------------
// Centralised money-display helpers. Every $-figure in the app should go
// through formatMoney() so the org's preferred currency + the user's locale
// drive both the symbol AND the number format (decimal separator, grouping,
// glyph direction in RTL).
//
// Currency resolution order (caller controls):
//   1. explicit `currency` arg on the call site (e.g. grant.currency)
//   2. org.preferred_currency (passed via the helper)
//   3. 'USD' fallback
//
// Why Intl.NumberFormat instead of a manual symbol map:
//   - handles RTL number direction automatically (Arabic embed)
//   - respects locale-specific grouping (e.g. "1 23 456,78" vs "123,456.78")
//   - knows symbol placement per locale (some put it after the number)
//   - knows the number of fractional digits per currency
//     (KES uses 2, JPY uses 0, etc.)
// ============================================================================

import { langToLocale } from './locale';

/** Map common ISO-4217 currencies to a sensible default locale.
 *  Used when the user's UI language doesn't pin one (e.g. EN user viewing
 *  an XOF amount — we render in en-XOF instead of en-US). */
const CURRENCY_LOCALE_HINT: Record<string, string> = {
  KES: 'en-KE',
  NGN: 'en-NG',
  ZAR: 'en-ZA',
  UGX: 'en-UG',
  TZS: 'en-TZ',
  ETB: 'en-ET',
  SOS: 'en-SO',
  EGP: 'ar-EG',
  GHS: 'en-GH',
  MAD: 'ar-MA',
  XOF: 'fr-SN',
  XAF: 'fr-CM',
  USD: 'en-US',
  EUR: 'en-GB',
  GBP: 'en-GB',
  CHF: 'de-CH',
};

/** Common currencies a user can pick (NGO orgs + donor orgs).
 *  Ordered roughly by frequency for the Global South audience. */
export const COMMON_CURRENCIES: { code: string; label: string }[] = [
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'KES', label: 'Kenyan Shilling (KES)' },
  { code: 'NGN', label: 'Nigerian Naira (NGN)' },
  { code: 'ZAR', label: 'South African Rand (ZAR)' },
  { code: 'UGX', label: 'Ugandan Shilling (UGX)' },
  { code: 'TZS', label: 'Tanzanian Shilling (TZS)' },
  { code: 'ETB', label: 'Ethiopian Birr (ETB)' },
  { code: 'SOS', label: 'Somali Shilling (SOS)' },
  { code: 'GHS', label: 'Ghanaian Cedi (GHS)' },
  { code: 'XOF', label: 'West African CFA Franc (XOF)' },
  { code: 'XAF', label: 'Central African CFA Franc (XAF)' },
  { code: 'EGP', label: 'Egyptian Pound (EGP)' },
  { code: 'MAD', label: 'Moroccan Dirham (MAD)' },
];

export interface FormatMoneyOptions {
  /** ISO 4217 currency. Default 'USD'. */
  currency?: string;
  /** UI language for locale resolution (en, fr, ar, sw, so, es). */
  lang?: string;
  /** Compact mode renders 1234567 as "1.2M". Default false (full). */
  compact?: boolean;
  /** Hide currency symbol — show only the number. */
  numericOnly?: boolean;
  /** Fall back to "TBD" / "—" when amount is null/undefined. Default "—". */
  fallback?: string;
}

/**
 * Format a monetary amount for display.
 *
 *   formatMoney(1234567)                       → "$1,234,567.00"
 *   formatMoney(1234567, { currency: 'KES' })  → "KSh 1,234,567.00"
 *   formatMoney(1234567, { compact: true })    → "$1.2M"
 *   formatMoney(null)                          → "—"
 */
export function formatMoney(
  amount: number | null | undefined,
  options: FormatMoneyOptions = {},
): string {
  const { fallback = '—', currency = 'USD', compact = false, numericOnly = false, lang } = options;
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return fallback;
  }
  const ccy = (currency || 'USD').toUpperCase();
  const localeFromLang = lang ? langToLocale(lang) : undefined;
  const locale = localeFromLang || CURRENCY_LOCALE_HINT[ccy] || 'en-US';

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: numericOnly ? 'decimal' : 'currency',
      currency: numericOnly ? undefined : ccy,
      currencyDisplay: 'symbol',
      notation: compact ? 'compact' : 'standard',
      compactDisplay: 'short',
      maximumFractionDigits: compact ? 1 : undefined,
      minimumFractionDigits: compact ? 0 : undefined,
    });
    return formatter.format(amount);
  } catch {
    // Some browsers may not know an exotic currency code — fall back to USD.
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: compact ? 1 : 2,
      }).format(amount);
    } catch {
      return `${ccy} ${amount.toLocaleString()}`;
    }
  }
}

/**
 * Get a single-character symbol for a currency (best-effort).
 * Useful in tight UI like icons / chips.
 */
export function currencySymbol(currency: string | undefined): string {
  if (!currency) return '$';
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).formatToParts(0);
    const symbolPart = parts.find(p => p.type === 'currency');
    return symbolPart?.value ?? currency;
  } catch {
    return currency.toUpperCase();
  }
}
