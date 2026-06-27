'use client';

import { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { translate, isRTL } from '@/i18n';
import { langToLocale } from '@/lib/locale';

/**
 * Hook that provides translation function bound to the current user's language.
 * Also applies RTL direction to <html> for Arabic.
 *
 * Phase 661 — falls back to network.default_language before 'en' when the
 * user hasn't set a preference. Proximate users land in Arabic by default;
 * Kuja/NEAR users default to English. The user's explicit choice always wins.
 */
export function useTranslation() {
  const user = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const lang =
    user?.language || network?.default_language || 'en';

  // Apply RTL direction to document root when language changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const rtl = isRTL(lang);
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(key, lang, params),
    [lang],
  );

  const formatDate = useCallback(
    (
      date: string | null | undefined | Date,
      opts?: Intl.DateTimeFormatOptions,
    ): string => {
      if (date === null || date === undefined || date === '') return '—';
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return '—';
      const options: Intl.DateTimeFormatOptions =
        opts ?? { month: 'short', day: 'numeric', year: 'numeric' };
      try {
        return new Intl.DateTimeFormat(langToLocale(lang), options).format(d);
      } catch {
        return d.toLocaleDateString('en-US', options);
      }
    },
    [lang],
  );

  return { t, lang, isRTL: isRTL(lang), formatDate };
}
