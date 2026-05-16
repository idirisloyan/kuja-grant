'use client';

/**
 * BankVerificationPanel — mechanical IBAN/SWIFT/jurisdiction checks.
 *
 * NGO enters bank details once; backend validates (no live bank API),
 * persists last4 + hash, and renders findings with severity + remediation.
 */

import { useState } from 'react';
import {
  CreditCard, Loader2, CheckCircle2, AlertTriangle, XCircle, Plus,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trustApi } from '@/lib/trust-api';
import type { BankVerification, BankFinding } from '@/lib/trust-api';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  verified: 'text-[hsl(var(--kuja-grow))]',
  review:   'text-[hsl(var(--kuja-sun))]',
  flagged:  'text-[hsl(var(--kuja-flag))]',
  pending:  'text-[hsl(var(--kuja-ink-soft))]',
  error:    'text-[hsl(var(--kuja-sun))]',
};

const STATUS_ICON = {
  verified: CheckCircle2,
  review:   AlertTriangle,
  flagged:  XCircle,
  pending:  AlertTriangle,
  error:    AlertTriangle,
};

const SEV_TONE: Record<string, string> = {
  high:   'bg-[hsl(var(--kuja-flag)/0.1)] text-[hsl(var(--kuja-flag))] border-[hsl(var(--kuja-flag)/0.3)]',
  medium: 'bg-[hsl(var(--kuja-sun)/0.1)] text-[hsl(var(--kuja-sun))] border-[hsl(var(--kuja-sun)/0.3)]',
  low:    'bg-[hsl(var(--kuja-ink-soft)/0.1)] text-[hsl(var(--kuja-ink-soft))] border-[hsl(var(--kuja-ink-soft)/0.3)]',
};

function FindingRow({ f }: { f: BankFinding }) {
  return (
    <div className={cn('rounded-md border p-2.5 text-xs', SEV_TONE[f.severity] ?? SEV_TONE.low)}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <Badge variant="outline" className={SEV_TONE[f.severity] ?? SEV_TONE.low}>
          {f.severity.toUpperCase()}
        </Badge>
        <code className="text-[10px] opacity-70">{f.code}</code>
      </div>
      <p className="mt-1.5 leading-relaxed text-[hsl(var(--kuja-ink))]">{f.message}</p>
    </div>
  );
}

export interface BankVerificationPanelProps {
  orgId: number;
  initialLatest?: BankVerification | null;
  canRun?: boolean;
}

export function BankVerificationPanel({
  orgId, initialLatest, canRun = true,
}: BankVerificationPanelProps) {
  const [latest, setLatest] = useState<BankVerification | null>(initialLatest ?? null);
  const [showForm, setShowForm] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bankName, setBankName] = useState('');
  const [bankCountry, setBankCountry] = useState('');
  const [swift, setSwift] = useState('');
  const [iban, setIban] = useState('');
  const [currency, setCurrency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const resp = await trustApi.runBankVerification({
        org_id: orgId,
        bank_name: bankName || undefined,
        bank_country: bankCountry || undefined,
        swift_bic: swift || undefined,
        iban: iban || undefined,
        currency: currency || undefined,
        account_number: accountNumber || undefined,
      });
      setLatest(resp.verification);
      setShowForm(false);
      // Clear account number from memory immediately
      setAccountNumber('');
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const StatusIcon = latest ? (STATUS_ICON[latest.status] ?? AlertTriangle) : CheckCircle2;

  return (
    <Card className="p-4 sm:p-5 border-[hsl(var(--border))]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-clay)/0.1)]">
            <CreditCard className="w-5 h-5 text-[hsl(var(--kuja-clay))]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[hsl(var(--kuja-ink))]">Bank Account Verification</h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Structural validation: IBAN checksum · SWIFT format · jurisdiction · FATF lists.
              We don&apos;t store full account numbers — only last 4 digits + hash.
            </p>
          </div>
        </div>
        {canRun && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))]"
          >
            <Plus className="w-3.5 h-3.5" />
            {latest ? 'Re-verify' : 'Verify bank details'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-[hsl(var(--kuja-flag)/0.1)] border border-[hsl(var(--kuja-flag)/0.3)] p-2.5 text-xs text-[hsl(var(--kuja-flag))]">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="bank-name" className="kuja-label">Bank name</Label>
            <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Equity Bank" />
          </div>
          <div>
            <Label htmlFor="bank-country" className="kuja-label">Bank country (ISO 2-letter)</Label>
            <Input id="bank-country" maxLength={2} value={bankCountry} onChange={(e) => setBankCountry(e.target.value.toUpperCase())} placeholder="KE" />
          </div>
          <div>
            <Label htmlFor="swift" className="kuja-label">SWIFT / BIC (optional)</Label>
            <Input id="swift" maxLength={11} value={swift} onChange={(e) => setSwift(e.target.value.toUpperCase())} placeholder="EQBLKENAXXX" />
          </div>
          <div>
            <Label htmlFor="iban" className="kuja-label">IBAN (optional)</Label>
            <Input id="iban" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="KE82EQBL..." />
          </div>
          <div>
            <Label htmlFor="currency" className="kuja-label">Currency (ISO 4217)</Label>
            <Input id="currency" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="KES" />
          </div>
          <div>
            <Label htmlFor="acct" className="kuja-label">Account number</Label>
            <Input id="acct" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Used for validation only — only last 4 stored." />
          </div>
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--kuja-sand-50))]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--kuja-clay-dark))] disabled:opacity-60"
            >
              {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</> : 'Verify'}
            </button>
          </div>
        </form>
      )}

      {!latest && !showForm && (
        <div className="mt-4 rounded-md border-2 border-dashed border-[hsl(var(--border))] p-6 text-center">
          <CreditCard className="w-8 h-8 mx-auto text-[hsl(var(--kuja-ink-soft))]" />
          <p className="text-sm font-semibold mt-2">No bank details verified yet</p>
          <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">
            Click <strong>Verify bank details</strong> to validate IBAN/SWIFT and screen the bank&apos;s jurisdiction.
          </p>
        </div>
      )}

      {latest && !showForm && (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-[hsl(var(--border))] p-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <div className="text-sm font-semibold">{latest.bank_name || 'Bank'}</div>
                <div className="text-[11px] text-[hsl(var(--kuja-ink-soft))]">
                  {latest.bank_country && <>Country: <strong>{latest.bank_country}</strong></>}
                  {latest.swift_bic && <> · SWIFT: {latest.swift_bic}</>}
                  {latest.iban && <> · IBAN: {latest.iban}</>}
                  {latest.account_number_last4 && <> · acct ****{latest.account_number_last4}</>}
                  {latest.currency && <> · {latest.currency}</>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon className={cn('w-4 h-4', STATUS_TONE[latest.status])} />
                <span className={cn('text-sm font-semibold uppercase', STATUS_TONE[latest.status])}>
                  {latest.status}
                </span>
                <span className="text-xs text-[hsl(var(--kuja-ink-soft))]">
                  · risk {latest.risk_score}/100
                </span>
              </div>
            </div>
          </div>

          {latest.findings.length === 0 ? (
            <div className="rounded-md border border-[hsl(var(--kuja-grow)/0.3)] bg-[hsl(var(--kuja-grow)/0.05)] p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[hsl(var(--kuja-grow))] shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong>No issues found.</strong> All structural checks passed.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {latest.findings.map((f, i) => <FindingRow key={i} f={f} />)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
