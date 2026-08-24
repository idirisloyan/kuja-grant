'use client';

/**
 * Public partner contract-signing page — R-04 (Aug 2026).
 *
 * The partner lands here via a link the Oversight Body shares over
 * SMS/WhatsApp:  /proximate-contract-sign?t=<token>
 *
 * No login — the token IS the credential (same pattern as the disbursement
 * report + endorser portals). This is what makes the partner signature an
 * INDEPENDENT act: the OB cannot record it on their behalf (the OB PATCH
 * route refuses to set status 'partner_signed'), so both sides of the
 * agreement are signed by different identities.
 *
 * Token is read from window.location at runtime so the route stays
 * static-export-safe (no dynamic params).
 */

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, FileSignature } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface ContractMeta {
  contract_id: number;
  status: string;
  partner_name: string | null;
  partner_name_ar: string | null;
  official_name_ar: string | null;
  official_name_en: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  approved_amount_usd: number | null;
  local_currency: string | null;
  local_amount: number | null;
  duration_days: number | null;
  reporting_deadline: string | null;
  already_signed: boolean;
  partner_signed_at: string | null;
  partner_signed_name: string | null;
}

function fmtMoney(n: number | null, ccy?: string | null) {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: (ccy || 'USD'), maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toLocaleString()} ${ccy || 'USD'}`;
  }
}

export default function ProximateContractSignPage() {
  const [token, setToken] = useState<string | null>(null);
  const [meta, setMeta] = useState<ContractMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [signedName, setSignedName] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setLoadError('This signing link is missing its code. Please use the full link sent to you.');
      setLoading(false);
      return;
    }
    setToken(tk);
    fetch(`${API_BASE}/api/proximate/contract-sign/${encodeURIComponent(tk)}`, {
      headers: { 'X-Network-Override': 'proximate' },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.success) {
          setLoadError(data.error || 'This agreement could not be loaded.');
        } else {
          setMeta(data.contract);
          if (data.contract?.already_signed) {
            setSigned(true);
            setSignedName(data.contract.partner_signed_name || null);
          }
        }
      })
      .catch(() => setLoadError('This agreement could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  async function submit() {
    if (!token || submitting) return;
    if (!fullName.trim() || !agree) {
      setSubmitError('Type your full name and tick the box to sign.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/api/proximate/contract-sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Network-Override': 'proximate' },
        body: JSON.stringify({ full_name: fullName.trim(), agree: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'Could not record your signature. Please try again.');
      } else {
        setSigned(true);
        setSignedName(data.contract?.partner_signed_name || fullName.trim());
      }
    } catch {
      setSubmitError('Could not record your signature. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto">
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
          </Card>
        </div>
      </div>
    );
  }

  // Signed confirmation — kept structurally simple + translate="no" so
  // browser auto-translate can't break the state transition (see R-07).
  if (signed) {
    return (
      <div translate="no" className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className="max-w-xl mx-auto">
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl kuja-display mb-2">Agreement signed</h1>
            <p className="text-sm text-muted-foreground">
              Thank you{signedName ? `, ${signedName}` : ''}. Your signature has been recorded.
              Adeso will countersign, and funds are released once the agreement is complete.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const orgName = meta?.official_name_en || meta?.partner_name || meta?.official_name_ar || 'your organisation';

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-[hsl(var(--kuja-clay))]" />
          <h1 className="text-xl kuja-display">Sign your grant agreement</h1>
        </div>

        <Card className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Please review the agreement for <span className="font-medium text-foreground">{orgName}</span> and
            sign below to confirm you accept its terms.
          </p>
          <dl className="text-sm divide-y divide-border">
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted-foreground">Grant amount</dt>
              <dd className="font-medium tabular-nums">{fmtMoney(meta?.approved_amount_usd ?? null, 'USD')}</dd>
            </div>
            {meta?.local_amount != null && (
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-muted-foreground">Local amount</dt>
                <dd className="font-medium tabular-nums">{fmtMoney(meta.local_amount, meta.local_currency)}</dd>
              </div>
            )}
            {meta?.duration_days != null && (
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-muted-foreground">Implementation period</dt>
                <dd className="font-medium">{meta.duration_days} days</dd>
              </div>
            )}
            {meta?.reporting_deadline && (
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-muted-foreground">Reporting due</dt>
                <dd className="font-medium">{new Date(meta.reporting_deadline).toLocaleDateString()}</dd>
              </div>
            )}
            {meta?.signatory_name && (
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-muted-foreground">Authorised signatory</dt>
                <dd className="font-medium text-right">
                  {meta.signatory_name}
                  {meta.signatory_title ? <span className="block text-[11px] text-muted-foreground">{meta.signatory_title}</span> : null}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <Card className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Your full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Type your full name to sign"
              maxLength={200}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              I am authorised to sign on behalf of {orgName}, and I accept the terms of this grant agreement.
            </span>
          </label>
          {submitError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {submitError}
            </div>
          )}
          <Button
            onClick={submit}
            disabled={submitting || !fullName.trim() || !agree}
            className="w-full"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
            Sign agreement
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Your typed name is recorded as your signature, with the date and time.
          </p>
        </Card>
      </div>
    </div>
  );
}
