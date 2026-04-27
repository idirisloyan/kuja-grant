// ============================================================================
// useApiError — render API errors in the user's language
// ----------------------------------------------------------------------------
// Pairs with the Phase 0.3 server-side error helper. The server returns a
// stable machine-readable `error` code and a `message` already localized to
// the user's preferred language. Most components can just render `message`
// directly. This hook adds two affordances:
//
//   1. Local fallback i18n lookup. If the server is older or returns the
//      legacy shape (English-only), we attempt a frontend t() lookup using
//      `server.error.<code>` so we still render in the user's language.
//
//   2. A consistent shape: { code, message, statusText, retriable } that
//      callers can branch on for recovery UX.
//
// Usage:
//   const formatError = useApiError();
//   try { await api.post(...) }
//   catch (e) { setError(formatError(e)); }
// ============================================================================

import { useTranslation } from './use-translation';
import { ApiError } from '../api';

export interface NormalizedApiError {
  /** Machine-readable code, stable across languages. */
  code: string;
  /** Human-readable, localized message ready for the UI. */
  message: string;
  /** HTTP status (0 for network errors). */
  status: number;
  /** Whether the user can reasonably retry. */
  retriable: boolean;
}

/**
 * Returns a function that normalizes any thrown value into a NormalizedApiError.
 * Always safe to call — never throws — so it's appropriate inside catch blocks.
 */
export function useApiError() {
  const { t } = useTranslation();

  return function formatError(err: unknown): NormalizedApiError {
    if (err instanceof ApiError) {
      const code = err.code || `HTTP_${err.status}`;
      // If the server already gave us a localized message, prefer it. Otherwise
      // try the local i18n catalog under server.error.<code>.
      const i18nKey = `server.error.${code}`;
      const local = t(i18nKey);
      const message =
        // err.message differs from err.code only when the server returned
        // a real localized message (the new shape). Use it as-is.
        err.message !== code
          ? err.message
          : // Otherwise try the frontend's catalog. If that also returns
            // the raw key (no translation), fall back to the original message.
            local !== i18nKey
            ? local
            : err.message;

      return {
        code,
        message,
        status: err.status,
        retriable: err.status >= 500 || err.status === 429,
      };
    }

    if (err instanceof Error) {
      return {
        code: 'NETWORK',
        message: err.message || t('server.error.server.unexpected'),
        status: 0,
        retriable: true,
      };
    }

    return {
      code: 'UNKNOWN',
      message: t('server.error.server.unexpected'),
      status: 0,
      retriable: false,
    };
  };
}
