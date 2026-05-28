'use client';

/**
 * /settings/security — Phase 26C (May 2026).
 *
 * Security settings landing: biometric / hardware-key re-auth enrolment.
 * Also discovery card for the admin-only TOTP 2FA enrolment (Phase 13.15)
 * so admins find that flow without typing the /admin/security path.
 */

import Link from 'next/link';
import { ShieldCheck, KeyRound, ChevronRight } from 'lucide-react';
import { WebAuthnPanel } from '@/components/shared/webauthn-panel';
import { useAuthStore } from '@/stores/auth-store';

export default function SecuritySettingsPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="kuja-display text-2xl">Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage trusted devices for biometric re-authentication on sensitive
          actions. Enrolment is optional — your password remains the primary
          credential.
        </p>
      </div>
      <WebAuthnPanel />
      {user?.role === 'admin' && (
        <Link
          href="/admin/security/"
          className="block border border-border rounded-lg bg-card p-4 hover:bg-muted/40 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-[hsl(var(--kuja-clay))] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                Two-factor authentication (TOTP)
                <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--kuja-grow))]" />
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Required for admin accounts. Scan the secret into Authy,
                Google Authenticator, or 1Password, then enter the rolling
                6-digit code at sign-in.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      )}
    </div>
  );
}
