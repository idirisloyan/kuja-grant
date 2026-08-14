'use client';

/**
 * /change-password — forced first-login password change.
 *
 * A user created (or reset) by an admin carries must_change_password=true.
 * The login flow routes them here instead of the dashboard, and the server
 * middleware 403s every other API call until they set a new password — so
 * this screen is a real gate, not just a redirect.
 *
 * On success we route to the right home the same way the login page does
 * (persona-aware for Proximate).
 */

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { ChangePasswordForm } from '@/components/shared/change-password-form';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';

export default function ChangePasswordPage() {
  const user = useAuthStore((s) => s.user);
  const checkSession = useAuthStore((s) => s.checkSession);
  const network = useNetworkStore((s) => s.network);
  const tenantName = network?.name || 'Kuja';
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!useAuthStore.getState().user) await checkSession();
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Not signed in at all → back to login.
  useEffect(() => {
    if (ready && !useAuthStore.getState().user) {
      window.location.href = '/login';
    }
  }, [ready]);

  const onSuccess = async () => {
    // Persona-aware landing, mirroring the login page.
    let target = '/dashboard/';
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
      const r = await fetch(`${apiBase}/api/proximate/persona/me`, {
        credentials: 'include',
        headers: { 'X-Network-Override': 'proximate' },
      });
      if (r.ok) {
        const body = await r.json();
        if (body?.persona === 'donor') target = '/proximate/donor';
        else if (body?.persona === 'ob' || body?.persona === 'admin') target = '/proximate/admin';
      }
    } catch {
      /* fall through to /dashboard/ */
    }
    window.location.href = target;
  };

  return (
    <div dir="ltr" className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #261A14 30%, #4A1F10 70%, #7C2D12 100%)' }}
      />
      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl bg-card/95 backdrop-blur border border-border/40 shadow-2xl p-6 lg:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--kuja-clay))] text-white shadow">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="kuja-display text-xl text-foreground">Set a new password</h1>
              <p className="text-xs text-muted-foreground">
                {user?.name ? `${user.name} · ` : ''}{tenantName}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Your account was set up with a temporary password. Choose a new one
            you&#39;ll remember — you can&#39;t use the rest of {tenantName} until this is done.
          </p>
          <ChangePasswordForm forced onSuccess={onSuccess} />
        </div>
      </div>
    </div>
  );
}
