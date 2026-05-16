'use client';

/**
 * /settings/security — Phase 26C (May 2026).
 *
 * Security settings landing: biometric / hardware-key re-auth enrolment.
 * TOTP 2FA UX lives elsewhere (Phase 13.15) — this surface focuses on
 * the WebAuthn re-auth flow added in Phase 26C.
 */

import { WebAuthnPanel } from '@/components/shared/webauthn-panel';

export default function SecuritySettingsPage() {
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
    </div>
  );
}
