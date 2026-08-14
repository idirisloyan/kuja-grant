'use client';

// ============================================================================
// LicenseRequiredDialog — Kuja Grant licensing (Phase 2, frontend).
//
// Mounted ONCE in the authenticated app layout. Listens for the global
// `kuja:license-required` event (fired by the API client on a 403
// license_required) and shows a friendly "grant licence required" prompt in
// place of a raw error toast. Purely reactive: it appears only when the server
// actually enforces the gate, so with GRANT_LICENSING_ENFORCED off (prod today)
// it never shows.
// ============================================================================

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import {
  LICENSE_REQUIRED_EVENT, type LicenseRequiredDetail,
} from '@/lib/license-gate';

export function LicenseRequiredDialog() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<LicenseRequiredDetail>({});

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<LicenseRequiredDetail>;
      setDetail(ce.detail || {});
      setOpen(true);
    };
    window.addEventListener(LICENSE_REQUIRED_EVENT, handler);
    return () => window.removeEventListener(LICENSE_REQUIRED_EVENT, handler);
  }, []);

  // Admins can grant licences themselves; donors must ask a platform admin.
  const isAdmin = user?.role === 'admin';
  // Prefer any localized server message; otherwise our own copy.
  const body = detail.message
    || (isAdmin
      ? t('license.required.body_admin')
      : t('license.required.body_donor'));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--kuja-spark-soft,var(--muted)))]">
            <KeyRound className="h-5 w-5 text-[hsl(var(--kuja-clay,var(--primary)))]" aria-hidden />
          </div>
          <DialogTitle>{t('license.required.title')}</DialogTitle>
          <DialogDescription className="pt-1 leading-relaxed">{body}</DialogDescription>
        </DialogHeader>
        {isAdmin && (
          <p className="text-sm text-muted-foreground">
            {t('license.required.admin_hint')}
          </p>
        )}
        <DialogFooter className="mt-2">
          <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">
            {t('license.required.dismiss')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
