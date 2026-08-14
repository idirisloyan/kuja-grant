'use client';

/**
 * ChangePasswordForm — self-service password change.
 *
 * Used in two places:
 *   - /settings/security  (normal rotation, `forced={false}`)
 *   - /change-password    (forced first-login change, `forced={true}`)
 *
 * The only backend call is POST /api/auth/change-password, which also clears
 * the must_change_password flag. On success we call onSuccess so the forced
 * page can navigate on into the app.
 */

import { useState, type FormEvent } from 'react';
import { Loader2, KeyRound, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';

const MIN_LEN = 10;

const INPUT_CLS =
  'block w-full h-10 px-3 text-sm bg-background text-foreground rounded-md ' +
  'border border-input focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[hsl(var(--kuja-clay))] focus-visible:border-[hsl(var(--kuja-clay))] ' +
  'disabled:opacity-50';

export function ChangePasswordForm({
  forced = false,
  onSuccess,
}: {
  forced?: boolean;
  onSuccess?: () => void;
}) {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < MIN_LEN) {
      setError(`New password must be at least ${MIN_LEN} characters.`);
      return;
    }
    if (next !== confirm) {
      setError('The two new-password fields do not match.');
      return;
    }
    if (next === current) {
      setError('New password must be different from your current one.');
      return;
    }
    setBusy(true);
    const res = await changePassword(current, next);
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
      onSuccess?.();
    } else {
      setError(res.error || 'Could not change your password.');
    }
  }

  if (done && !forced) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
        <Check className="w-4 h-4 shrink-0" /> Your password has been changed.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="cp-current" className="text-xs font-medium text-muted-foreground">
          {forced ? 'Temporary password (from your welcome message)' : 'Current password'}
        </label>
        <input
          id="cp-current" type="password" autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)}
          disabled={busy} className={INPUT_CLS} required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="cp-new" className="text-xs font-medium text-muted-foreground">
          New password <span className="opacity-70">(at least {MIN_LEN} characters)</span>
        </label>
        <input
          id="cp-new" type="password" autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)}
          disabled={busy} className={INPUT_CLS} required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="cp-confirm" className="text-xs font-medium text-muted-foreground">
          Confirm new password
        </label>
        <input
          id="cp-confirm" type="password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          disabled={busy} className={INPUT_CLS} required
        />
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <Button
        type="submit"
        disabled={busy || !current || !next || !confirm}
        className="w-full h-10 bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white"
      >
        {busy
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
          : <><KeyRound className="mr-2 h-4 w-4" /> {forced ? 'Set my password' : 'Change password'}</>}
      </Button>
    </form>
  );
}
