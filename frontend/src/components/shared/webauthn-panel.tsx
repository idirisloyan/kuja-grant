'use client';

/**
 * WebAuthnPanel — Phase 26C (May 2026).
 *
 * Settings UI for managing the user's biometric / hardware-key
 * credentials. List registered credentials, add a new one via the
 * browser's WebAuthn API, revoke any device. Designed for the
 * /settings/security route but mountable anywhere.
 *
 * Browser support: WebAuthn is widely supported on every modern
 * desktop browser + mobile Safari/Chrome on iOS 15+/Android 9+.
 * Older / unsupported browsers see a gentle explainer instead of
 * a broken-looking enrol button.
 */

import { useEffect, useState } from 'react';
import {
  Fingerprint, Loader2, Plus, Trash2, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface CredentialRow {
  id: number;
  label: string;
  transport_hint?: string | null;
  created_at?: string | null;
  last_used_at?: string | null;
}

interface ListResp { success: boolean; credentials: CredentialRow[] }
interface BeginResp { success: boolean; publicKey: string; reason?: string }
interface FinishResp { success: boolean; reason?: string; credential?: CredentialRow }

function isSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential === 'function';
}

// base64url helpers — the server hands us a JSON string the WebAuthn
// API needs to consume with binary fields decoded from base64url.
function b64urlDecode(s: string): ArrayBuffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function b64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCreationOptions(jsonStr: string): PublicKeyCredentialCreationOptions {
  const o = JSON.parse(jsonStr);
  o.challenge = b64urlDecode(o.challenge);
  o.user.id = b64urlDecode(o.user.id);
  if (Array.isArray(o.excludeCredentials)) {
    o.excludeCredentials = o.excludeCredentials.map((c: { id: string }) => ({
      ...c,
      id: b64urlDecode(c.id),
    }));
  }
  return o as PublicKeyCredentialCreationOptions;
}

function encodeAttestation(cred: PublicKeyCredential): Record<string, unknown> {
  const att = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: b64urlEncode(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: b64urlEncode(att.attestationObject),
      clientDataJSON: b64urlEncode(att.clientDataJSON),
    },
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
}

export function WebAuthnPanel() {
  const supported = isSupported();
  const [creds, setCreds] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const r = await api.get<ListResp>('/api/auth/webauthn/credentials');
      setCreds(r.credentials ?? []);
    } catch {
      /* quiet — keep prior list */
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const enroll = async () => {
    if (!supported) return;
    setEnrolling(true);
    try {
      const begin = await api.post<BeginResp>('/api/auth/webauthn/register/begin', {});
      if (!begin.success || !begin.publicKey) {
        toast.error('Could not start enrolment');
        return;
      }
      const options = decodeCreationOptions(begin.publicKey);
      const cred = await navigator.credentials.create({ publicKey: options });
      if (!cred) {
        toast.error('No credential created');
        return;
      }
      const labelGuess = /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone/iPad'
        : /Android/i.test(navigator.userAgent) ? 'Android device'
        : /Mac/i.test(navigator.userAgent) ? 'Mac Touch ID'
        : /Windows/i.test(navigator.userAgent) ? 'Windows Hello'
        : 'Security key';
      const finish = await api.post<FinishResp>('/api/auth/webauthn/register/finish', {
        credential: encodeAttestation(cred as PublicKeyCredential),
        label: labelGuess,
      });
      if (finish.success) {
        toast.success('Device enrolled');
        await refresh();
      } else {
        toast.error(`Enrolment failed: ${finish.reason ?? 'unknown'}`);
      }
    } catch (e) {
      const msg = (e as Error).message || 'Enrolment cancelled';
      if (!/aborted|cancelled|NotAllowed/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setEnrolling(false);
    }
  };

  const revoke = async (id: number) => {
    if (!window.confirm('Remove this device? You will need to re-enrol it later.')) return;
    setRevoking(id);
    try {
      await api.delete(`/api/auth/webauthn/credentials/${id}`);
      toast.success('Device removed');
      await refresh();
    } catch {
      toast.error('Could not remove device');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-2 mb-3">
        <ShieldCheck className="h-5 w-5 mt-0.5 text-[hsl(var(--kuja-clay))]" />
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--kuja-clay))]">
            Biometric re-auth
          </div>
          <h3 className="kuja-display text-lg">Trusted devices</h3>
          <p className="text-xs text-muted-foreground">
            Enrol Touch ID, Face ID, Windows Hello, or a hardware security key to
            re-confirm sensitive actions (settings changes, document downloads)
            without re-typing your password.
          </p>
        </div>
      </div>

      {!supported && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Your browser doesn&apos;t support WebAuthn. Update to a recent Chrome,
            Safari, Firefox, or Edge build.
          </div>
        </div>
      )}

      {supported && (
        <>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading devices…
            </div>
          ) : creds.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No devices enrolled yet. Tap the button below to add this device.
            </p>
          ) : (
            <ul className="space-y-2 mb-3">
              {creds.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Fingerprint className="h-4 w-4 text-[hsl(var(--kuja-clay))] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.label || 'Unnamed device'}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Added {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                        {c.last_used_at && ` · last used ${new Date(c.last_used_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(c.id)}
                    disabled={revoking === c.id}
                    aria-label="Remove device"
                    className="text-muted-foreground hover:text-[hsl(var(--kuja-flag))]"
                  >
                    {revoking === c.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button
            size="sm"
            onClick={enroll}
            disabled={enrolling}
            className="gap-1.5 bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay))]/90 text-white"
          >
            {enrolling
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5" />}
            Enrol this device
          </Button>
        </>
      )}
    </Card>
  );
}
