'use client';

/**
 * TwoFactorNagBanner — Phase 13.15
 *
 * PMO's pattern: nag, then enforce. Banner shows on every page when
 * the current admin lacks 2FA. Soft enforcement now; flip to a hard
 * middleware gate after a few weeks of nag.
 *
 * Idempotent — only renders for admin role + totp_enabled=false.
 * Dismissible via localStorage flag (per-day reset, so the nag
 * returns each morning until they enroll).
 */

import { useEffect, useState } from 'react';
import { Shield, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Status {
  enabled: boolean;
  admin_should_enroll: boolean;
}

const DISMISS_KEY = 'kuja_2fa_nag_dismissed';

function dismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ts = window.localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    const dismissed = new Date(ts);
    const now = new Date();
    // Reset at local midnight — so the nag returns the next morning.
    return (
      dismissed.getFullYear() === now.getFullYear()
      && dismissed.getMonth() === now.getMonth()
      && dismissed.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

export function TwoFactorNagBanner() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(() => dismissedToday());

  useEffect(() => {
    if (!user || user.role !== 'admin' || dismissed) return;
    let cancelled = false;
    api.get<Status & { success: boolean }>('/auth/totp/status')
      .then((res) => { if (!cancelled) setStatus(res); })
      .catch(() => { /* not configured or error — silent */ });
    return () => { cancelled = true; };
  }, [user, dismissed]);

  if (!user || user.role !== 'admin' || dismissed) return null;
  if (!status || status.enabled || !status.admin_should_enroll) return null;

  return (
    <div className="border-b border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] text-[hsl(var(--kuja-flag))]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 flex-shrink-0" />
          <p className="text-sm">
            <strong className="font-semibold">{t('twofa_nag.title')}</strong>{' '}
            <span className="text-foreground">{t('twofa_nag.body')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/admin/security/"
            className="inline-flex items-center rounded-md bg-[hsl(var(--kuja-flag))] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            {t('twofa_nag.enroll_now')}
          </Link>
          <button
            type="button"
            onClick={() => {
              try { window.localStorage.setItem(DISMISS_KEY, new Date().toISOString()); } catch {}
              setDismissed(true);
            }}
            className="rounded p-1 hover:bg-[hsl(0_85%_94%)]"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
