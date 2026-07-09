'use client';

/**
 * Record a Proximate disbursement — Phase 653 (June 2026).
 *
 * OB picks a cleared partner, enters amount + purpose + optional
 * round + window, and records the release. Backend issues a
 * report_token; we surface it as a copy-link CTA so the OB can
 * paste the partner-facing URL into WhatsApp/SMS.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Send, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { WhyBlocked, type Blocker } from '@/components/proximate/next-step';

interface Partner {
  id: number;
  name: string;
  status: string;
  locality: string | null;
}

interface Round {
  id: number;
  title: string;
  status: string;
}

interface CreateResp {
  success: boolean;
  disbursement?: {
    id: number;
    partner_name: string | null;
    amount_usd: number | null;
    report_token: string | null;
    report_due_at: string | null;
  };
  error?: string;
}

export default function ProximateDisbursementNewPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [partnerId, setPartnerId] = useState<string>('');
  const [roundId, setRoundId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [windowDays, setWindowDays] = useState<string>('14');
  // Phase 669 — ISF (SoP §3) annotation. OB confirms the partner cleared
  // the Internally Stratified Funding gate. Recorded as audit metadata.
  const [isfCleared, setIsfCleared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResp['disbursement'] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ partners: Partner[] }>('/api/proximate/partners').catch(() => ({ partners: [] })),
      api.get<{ rounds: Round[] }>('/api/proximate/rounds').catch(() => ({ rounds: [] })),
    ]).then(([p, r]) => {
      setPartners((p.partners || []).filter(
        (x) => ['dd_clear', 'endorsements_open', 'dd_pending'].includes(x.status)
      ));
      setRounds((r.rounds || []).filter((x) => x.status === 'active'));
    });
  }, []);

  // Phase 717 create-from-here — a partner detail page can deep-link
  // "?partner=<id>" to land here with that partner pre-selected.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search).get('partner');
    if (p && /^\d+$/.test(p)) setPartnerId(p);
  }, []);

  // Phase 717 "why blocked?" — the exact preconditions a release needs,
  // shown the moment a partner (and optionally an amount) is chosen.
  const [preflight, setPreflight] = useState<{ blockers: Blocker[]; warnings: Blocker[] } | null>(null);
  useEffect(() => {
    if (!partnerId) { setPreflight(null); return; }
    const params = new URLSearchParams({ partner_id: partnerId });
    if (amount && parseFloat(amount) > 0) params.set('amount', amount);
    let cancelled = false;
    api.get<{ blockers: Blocker[]; warnings: Blocker[] }>(
      `/api/proximate/disbursements/preflight?${params.toString()}`)
      .then((r) => { if (!cancelled) setPreflight({ blockers: r.blockers || [], warnings: r.warnings || [] }); })
      .catch(() => { if (!cancelled) setPreflight(null); });
    return () => { cancelled = true; };
  }, [partnerId, amount]);

  async function submit() {
    setError(null);
    if (!partnerId) {
      setError(t('proximate.disbursements.partner_required'));
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError(t('proximate.disbursements.amount_required'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<CreateResp>('/api/proximate/disbursements', {
        partner_id: parseInt(partnerId, 10),
        round_id: roundId ? parseInt(roundId, 10) : undefined,
        amount_usd: parseFloat(amount),
        purpose: purpose.trim() || undefined,
        report_window_days: parseInt(windowDays, 10) || 14,
        isf_cleared: isfCleared,
      });
      if (!res.success || !res.disbursement) {
        setError(res.error || t('proximate.disbursements.create_failed'));
      } else {
        setResult(res.disbursement);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.disbursements.create_failed');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function copyReportUrl() {
    if (!result?.report_token) return;
    const url = `${window.location.origin}/proximate-report?t=${result.report_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (result) {
    const url = result.report_token
      ? `${window.location.origin}/proximate-report?t=${result.report_token}`
      : '';
    return (
      <PageShell>
        <PageHeader
          title={t('proximate.disbursements.recorded_title')}
          subtitle={t('proximate.disbursements.recorded_subtitle')}
        />
        <PageMain>
          <Card className="p-6 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {result.partner_name} — ${result.amount_usd?.toLocaleString()}
              </p>
              {result.report_due_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('proximate.disbursements.due')}{' '}
                  {new Date(result.report_due_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('proximate.disbursements.share_link_label')}
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                {t('proximate.disbursements.share_link_hint')}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={url}
                  className="flex-1 h-10 px-3 text-xs bg-muted border border-border rounded-md font-mono"
                />
                <Button size="sm" variant="outline" onClick={copyReportUrl}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/proximate/disbursements">
                <Button variant="outline" size="sm">
                  {t('proximate.disbursements.back_to_list')}
                </Button>
              </Link>
              <Button size="sm" onClick={() => { setResult(null); setPartnerId(''); setAmount(''); setPurpose(''); }}>
                {t('proximate.disbursements.record_another')}
              </Button>
            </div>
          </Card>
        </PageMain>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('proximate.disbursements.new_title')}
        subtitle={t('proximate.disbursements.new_subtitle')}
      />
      <PageMain>
        <Card className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('proximate.disbursements.field_partner')} *
            </label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
            >
              <option value="">— {t('proximate.disbursements.select_partner')} —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.locality ? `(${p.locality})` : ''} — {p.status}
                </option>
              ))}
            </select>
            {partners.length === 0 && (
              <div className="mt-2 rounded-md border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {t('proximate.disbursements.no_eligible_partners')}
                </p>
                {/* Phase 717 — actionable empty state: nominate → endorse
                    is the only way to get a fundable partner, so link it. */}
                <Link
                  href="/proximate/admin/partners/new"
                  className="mt-1.5 inline-flex text-xs font-semibold text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:no-underline"
                >
                  {(() => { const v = t('proximate.disbursements.nominate_cta'); return (!v || v === 'proximate.disbursements.nominate_cta') ? 'Nominate a partner' : v; })()} →
                </Link>
              </div>
            )}
          </div>

          {/* Phase 717 — why-blocked: exact missing preconditions before submit */}
          {preflight && (
            <WhyBlocked blockers={preflight.blockers} warnings={preflight.warnings} />
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('proximate.disbursements.field_round')}
            </label>
            <select
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
            >
              <option value="">— {t('proximate.disbursements.no_round')} —</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('proximate.disbursements.field_amount')} *
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('proximate.disbursements.field_window')}
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-background border border-border rounded-md"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('proximate.disbursements.window_hint')}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('proximate.disbursements.field_purpose')}
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
              placeholder={t('proximate.disbursements.field_purpose_placeholder')}
            />
          </div>

          {/* Phase 669 — ISF annotation (SoP §3) */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isfCleared}
              onChange={(e) => setIsfCleared(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs">
              <strong>{t('proximate.disbursements.isf_label')}</strong>
              <span className="block text-muted-foreground mt-0.5">
                {t('proximate.disbursements.isf_hint')}
              </span>
            </span>
          </label>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 me-2" />
              )}
              {t('proximate.disbursements.record')}
            </Button>
            <Link href="/proximate/disbursements">
              <Button variant="outline" disabled={submitting}>
                {t('proximate.disbursements.cancel')}
              </Button>
            </Link>
          </div>
        </Card>
      </PageMain>
    </PageShell>
  );
}
