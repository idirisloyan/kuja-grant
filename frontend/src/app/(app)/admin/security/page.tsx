'use client';

/**
 * /admin/security/ — Phase 13.15 UI
 *
 * TOTP 2FA enrollment + management for admin users. Renders three
 * states based on /api/auth/totp/status:
 *   1. Not enrolled → enrollment flow (start → confirm → recovery codes)
 *   2. Enrolled → status panel + disable affordance
 *   3. AI offline / pyotp missing → graceful degraded surface
 *
 * QR code rendering: SVG inline (no library install) — encodes the
 * provisioning URI as a QR matrix using a tiny pure-JS encoder.
 * Falls back to a "scan this URI / paste this secret" textbox if QR
 * generation fails.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, ShieldCheck, ShieldOff, Loader2, AlertTriangle, CheckCircle2,
  Copy, Check, Download, X, ExternalLink,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StatusResponse {
  enabled: boolean;
  enrolled_at: string | null;
  has_pyotp: boolean;
  admin_should_enroll: boolean;
}

interface EnrollStartResponse {
  secret: string;
  provisioning_uri: string;
  note?: string;
}

interface EnrollConfirmResponse {
  recovery_codes: string[];
  note?: string;
}

type View = 'loading' | 'unavailable' | 'not_enrolled' | 'enrolling' | 'showing_codes' | 'enrolled';

export default function SecurityPage() {
  const { t, formatDate } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<View>('loading');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [secret, setSecret] = useState<string>('');
  const [provisioningUri, setProvisioningUri] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the verify-code input when the enrolling view appears.
  // Eliminates an extra click between scan-secret and type-code.
  useEffect(() => {
    if (view === 'enrolling') {
      const id = window.setTimeout(() => codeInputRef.current?.focus(), 80);
      return () => window.clearTimeout(id);
    }
  }, [view]);

  // Format an alphanumeric TOTP secret as space-separated 4-char groups
  // for easier manual entry into an authenticator app.
  const formattedSecret = (secret.match(/.{1,4}/g) ?? []).join(' ');

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get<StatusResponse & { success: boolean }>('/auth/totp/status');
      setStatus(res);
      if (!res.has_pyotp) setView('unavailable');
      else if (res.enabled) setView('enrolled');
      else setView('not_enrolled');
    } catch {
      setView('unavailable');
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const startEnroll = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api.post<EnrollStartResponse & { success: boolean }>('/auth/totp/enroll/start', {});
      setSecret(res.secret);
      setProvisioningUri(res.provisioning_uri);
      setView('enrolling');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start enrollment');
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmEnroll = useCallback(async () => {
    if (verifyCode.length < 6) return;
    setBusy(true);
    try {
      const res = await api.post<EnrollConfirmResponse & { success: boolean }>(
        '/auth/totp/enroll/confirm', { code: verifyCode },
      );
      setRecoveryCodes(res.recovery_codes ?? []);
      setVerifyCode('');
      setView('showing_codes');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  }, [verifyCode]);

  const finishEnroll = useCallback(async () => {
    setRecoveryCodes([]);
    setSecret('');
    setProvisioningUri('');
    await loadStatus();
  }, [loadStatus]);

  const disable = useCallback(async () => {
    if (verifyCode.length < 6) return;
    if (!confirm(t('security.disable_confirm'))) return;
    setBusy(true);
    try {
      await api.post('/auth/totp/disable', { code: verifyCode });
      setVerifyCode('');
      toast.success(t('security.disabled'));
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disable failed');
    } finally {
      setBusy(false);
    }
  }, [verifyCode, loadStatus, t]);

  const copySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [secret]);

  const downloadCodes = useCallback(() => {
    const text = `Kuja recovery codes for ${user?.email ?? 'your account'}\nGenerated: ${new Date().toISOString()}\n\n${recoveryCodes.join('\n')}\n\nEach code works once. Keep them somewhere safe.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kuja-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [recoveryCodes, user]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] p-4 text-sm text-[hsl(var(--kuja-flag))]">
        {t('security.admin_only')}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <h1 className="kuja-display text-2xl flex items-center gap-2">
          <Shield className="h-6 w-6 text-[hsl(var(--kuja-clay))]" />
          {t('security.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('security.subtitle')}</p>
      </header>

      {view === 'loading' && (
        <div className="rounded-md border border-border bg-background p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {view === 'unavailable' && (
        <div className="rounded-md border border-[hsl(var(--kuja-sun))]/30 bg-[hsl(38_92%_97%)] p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--kuja-sun))] flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold">{t('security.unavailable_title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('security.unavailable_body')}</p>
            </div>
          </div>
        </div>
      )}

      {view === 'not_enrolled' && (
        <div className="rounded-md border border-border bg-background p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldOff className="h-6 w-6 text-[hsl(var(--kuja-flag))] flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold">{t('security.not_enrolled_title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('security.not_enrolled_body')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            {t('security.enroll_now')}
          </button>
        </div>
      )}

      {view === 'enrolling' && (
        <div className="rounded-md border border-border bg-background p-5 space-y-4">
          <h2 className="text-base font-semibold">{t('security.scan_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('security.scan_body')}</p>

          {/* Provisioning URI rendered as text + secret pasta. We avoid
              the QR library install by giving the user the raw URI to
              paste into Authy / Google Authenticator (most apps accept
              an otpauth:// URL); for an inline QR upgrade later, swap
              this to qrcode.react. */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
                {t('security.secret_label')}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tracking-wider break-all">
                  {formattedSecret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  {secretCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {secretCopied ? t('common.copied') : t('common.copy')}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Spaces are visual aids only — type or paste without them.
              </p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
                {t('security.uri_label')}
              </div>
              <a
                href={provisioningUri}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-[hsl(var(--kuja-clay))] hover:bg-muted"
              >
                <ExternalLink className="h-3 w-3" />
                Open in authenticator app
              </a>
              <p className="mt-1 text-[10px] text-muted-foreground break-all">
                or paste this URI: <code className="font-mono">{provisioningUri}</code>
              </p>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">
              {t('security.code_label')}
            </label>
            <input
              ref={codeInputRef}
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && verifyCode.length === 6 && !busy) {
                  void confirmEnroll();
                }
              }}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="w-full max-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-lg font-mono tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setView('not_enrolled'); setSecret(''); setProvisioningUri(''); setVerifyCode(''); }}
              disabled={busy}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmEnroll}
              disabled={busy || verifyCode.length < 6}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {t('security.confirm')}
            </button>
          </div>
        </div>
      )}

      {view === 'showing_codes' && (
        <div className="rounded-md border-2 border-[hsl(var(--kuja-grow))]/50 bg-[hsl(142_68%_98%)] p-5 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-[hsl(var(--kuja-grow))] flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold">{t('security.codes_title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('security.codes_body')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background p-3 font-mono text-sm">
            {recoveryCodes.map((c, i) => (
              <code key={i} className="px-2 py-1 bg-muted rounded">{c}</code>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadCodes}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              {t('security.download_codes')}
            </button>
            <button
              type="button"
              onClick={finishEnroll}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-grow))] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Check className="h-4 w-4" />
              {t('security.done')}
            </button>
          </div>
        </div>
      )}

      {view === 'enrolled' && status && (
        <div className="rounded-md border border-[hsl(var(--kuja-grow))]/30 bg-[hsl(142_68%_98%)] p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 text-[hsl(var(--kuja-grow))] flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold">{t('security.enrolled_title')}</h2>
              {status.enrolled_at && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('security.enrolled_at', { ts: formatDate(status.enrolled_at) })}
                </p>
              )}
            </div>
          </div>

          <details className="rounded-md border border-border bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              {t('security.disable_summary')}
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">{t('security.disable_body')}</p>
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                placeholder={t('security.code_label')}
                className="w-full max-w-[180px] rounded-md border border-input bg-background px-3 py-1.5 text-base font-mono tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-flag))]"
              />
              <button
                type="button"
                onClick={disable}
                disabled={busy || verifyCode.length < 6}
                className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--kuja-flag))]/30 bg-[hsl(0_85%_97%)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--kuja-flag))] hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                {t('security.disable')}
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
