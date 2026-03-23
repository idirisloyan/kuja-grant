'use client';

import { useCallback, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { translate, isRTL } from '@/i18n';

/**
 * Hook that provides translation function bound to the current user's language.
 * Also applies RTL direction to <html> for Arabic.
 */
export function useTranslation() {
  const user = useAuthStore((s) => s.user);
  const lang = user?.language || 'en';

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

  return { t, lang, isRTL: isRTL(lang) };
}
