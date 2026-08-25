'use client';

/**
 * F-02 / F-12 / F-20 — a failed data fetch must never render as an empty
 * state ("No disbursements yet"). This surfaces the ACTUAL failure —
 * distinguishing an expired session, a permission problem, a server error
 * and a connectivity problem — and offers a retry. Render this instead of
 * the empty state whenever a load threw.
 */

import { AlertTriangle, RotateCw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const status = error instanceof ApiError ? error.status : 0;
  let key = 'proximate.load_error.generic';
  if (status === 401) key = 'proximate.load_error.auth';
  else if (status === 403) key = 'proximate.load_error.forbidden';
  else if (status >= 500) key = 'proximate.load_error.server';
  else if (status === 0) key = 'proximate.load_error.network';

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="w-6 h-6 mx-auto text-destructive mb-2" />
      <p className="text-sm font-medium text-destructive">{t(key)}</p>
      <p className="text-xs text-muted-foreground mt-1">{t('proximate.load_error.not_empty')}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
        >
          <RotateCw className="w-3.5 h-3.5" /> {t('proximate.load_error.retry')}
        </button>
      )}
    </div>
  );
}
