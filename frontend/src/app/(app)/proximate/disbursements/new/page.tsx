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
import { Loader2, Send, Copy, Check, CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatComplianceDate } from '@/lib/format-date';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { useTranslation } from '@/lib/hooks/use-translation';
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

interface Method {
  id: number;
  display: string;
  status: string;
  fsp: { kind: string } | null;
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
  // Guarded i18n fallback — mirrors the existing nominate_cta pattern below.
  // Renders English when a key isn't in the locale bundle (keeps i18n parity
  // green without churning all six locale files for two operational strings).
  const tf = (key: string, fallback: string) => {
    const v = t(key);
    return !v || v === key ? fallback : v;
  };
  const router = useRouter();
  // PRX-RBAC-013 — recording money is OB-only. Non-OB personas can reach
  // this URL directly; the POST is server-gated (403 err.ob_required), but
  // the form must not render for them either. persona 'admin' (platform
  // super-admin) is NOT an OB, so it's excluded too.
  const { persona, isLoading: personaLoading } = useProximatePersona();
  const isOb = persona === 'ob';
  const [partners, setPartners] = useState<Partner[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [methodId, setMethodId] = useState<string>('');
  const [partnerId, setPartnerId] = useState<string>('');
  const [roundId, setRoundId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  // Blank by default: the reporting window follows the contract's
  // implementation period (computed server-side from receipt). Only a
  // deliberate override sends an explicit report_window_days — see the
  // override toggle below (Khalid SOP alignment, 29 Jul QA).
  const [windowDays, setWindowDays] = useState<string>('');
  const [overrideWindow, setOverrideWindow] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  // Phase 669 — ISF (SoP §3) annotation. OB confirms the partner cleared
  // the Internally Stratified Funding gate. Recorded as audit metadata.
  const [isfCleared, setIsfCleared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResp['disbursement'] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // OB-012 — a disbursement started from a round arrives with ?round=<id>
    // (the round page deep-links it). Capture it so we can pre-select the
    // round and scope the partner list to that round's awarded partners.
    const roundParam = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('round')
      : null;
    Promise.all([
      api.get<{ partners: Partner[] }>('/api/proximate/partners').catch(() => ({ partners: [] })),
      api.get<{ rounds: Round[] }>('/api/proximate/rounds').catch(() => ({ rounds: [] })),
    ]).then(([p, r]) => {
      // Only fully-cleared partners can receive money. Non-dd_clear
      // partners were previously listed (blocked at submit), which read
      // as confusing — hide them so the dropdown only offers fundable
      // partners. The preflight panel still explains any residual block.
      setPartners((p.partners || []).filter((x) => x.status === 'dd_clear'));
      // Active rounds are the disbursement targets; also keep the round we
      // were deep-linked from even if it has moved past 'active', so the
      // round scoping below can pin to it and the selector shows it.
      setRounds((r.rounds || []).filter(
        (x) => x.status === 'active' || (!!roundParam && String(x.id) === roundParam),
      ));
      if (roundParam && /^\d+$/.test(roundParam)) setRoundId(roundParam);
    });
  }, []);

  // PRX-DISB-001 — load the selected partner's verified payment routes so
  // the release records WHICH route it used. Auto-select when there's only
  // one; the OB picks when there are several.
  useEffect(() => {
    if (!partnerId) { setMethods([]); setMethodId(''); return; }
    let cancelled = false;
    api.get<{ methods: Method[] }>(
      `/api/proximate/partners/${partnerId}/disbursement-methods`)
      .then((r) => {
        if (cancelled) return;
        const verified = (r.methods || []).filter((m) => m.status === 'verified');
        setMethods(verified);
        setMethodId(verified.length === 1 ? String(verified[0].id) : '');
      })
      .catch(() => { if (!cancelled) { setMethods([]); setMethodId(''); } });
    return () => { cancelled = true; };
  }, [partnerId]);

  // Phase 717 create-from-here — a partner detail page can deep-link
  // "?partner=<id>" to land here with that partner pre-selected.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search).get('partner');
    if (p && /^\d+$/.test(p)) setPartnerId(p);
  }, []);

  // Phase 717 "why blocked?" — the exact preconditions a release needs,
  // shown the moment a partner (and optionally an amount) is chosen.
  const [preflight, setPreflight] = useState<{
    blockers: Blocker[];
    warnings: Blocker[];
    checklist: { code: string; label: string; ok: boolean }[];
  } | null>(null);
  useEffect(() => {
    if (!partnerId) { setPreflight(null); return; }
    const params = new URLSearchParams({ partner_id: partnerId });
    if (amount && parseFloat(amount) > 0) params.set('amount', amount);
    // OB-012 — pass the round so preflight includes the round-scoped award +
    // contract readiness items (else it returns only the partner-level ones).
    if (roundId) params.set('round_id', roundId);
    let cancelled = false;
    api.get<{ blockers: Blocker[]; warnings: Blocker[]; checklist?: { code: string; label: string; ok: boolean }[] }>(
      `/api/proximate/disbursements/preflight?${params.toString()}`)
      .then((r) => { if (!cancelled) setPreflight({ blockers: r.blockers || [], warnings: r.warnings || [], checklist: r.checklist || [] }); })
      .catch(() => { if (!cancelled) setPreflight(null); });
    return () => { cancelled = true; };
  }, [partnerId, amount, roundId]);

  // OB-012 (2026-07-27) — when a round is in scope, the partner dropdown must
  // offer ONLY that round's awarded partners, not every cleared partner in the
  // network (QA saw unrelated dd_clear partners offered from a round). Fetch
  // the round's award register; keep the awarded partner IDs. null = no round
  // selected → the full cleared list stands (freeform, non-round release).
  const [awardedIds, setAwardedIds] = useState<number[] | null>(null);
  useEffect(() => {
    if (!roundId) { setAwardedIds(null); return; }
    let cancelled = false;
    api.get<{ awards: { partner_id: number; decision: string }[] }>(
      `/api/proximate/rounds/${roundId}/awards`)
      .then((r) => {
        if (cancelled) return;
        setAwardedIds(
          (r.awards || [])
            .filter((a) => a.decision === 'awarded')
            .map((a) => a.partner_id),
        );
      })
      .catch(() => { if (!cancelled) setAwardedIds(null); });
    return () => { cancelled = true; };
  }, [roundId]);

  const roundScoped = awardedIds !== null;
  // Cleared partners, narrowed to the round's awarded partners when scoped.
  const visiblePartners = roundScoped
    ? partners.filter((p) => awardedIds!.includes(p.id))
    : partners;

  // If a scope change (round selected / switched) dropped the currently
  // selected partner, clear it so the OB can't record a release against a
  // partner not offered for this round.
  useEffect(() => {
    if (partnerId && !visiblePartners.some((p) => String(p.id) === partnerId)) {
      setPartnerId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awardedIds, partners]);

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
    const wd = parseInt(windowDays, 10);
    if (overrideWindow && (!wd || wd < 1 || wd > 90 || !overrideReason.trim())) {
      const msg = t('proximate.disbursements.window_override_required');
      setError(msg === 'proximate.disbursements.window_override_required'
        ? 'Enter a reporting window (1–90 days) and a reason for overriding '
          + 'the contract’s implementation period.'
        : msg);
      return;
    }
    setSubmitting(true);
    try {
      // By default we send NO report_window_days, so the backend anchors the
      // reporting deadline to the contract’s implementation period. Only a
      // deliberate override sends an explicit window (with a reason recorded
      // in the purpose so it stays auditable). SOP alignment, 29 Jul QA.
      const payload: Record<string, unknown> = {
        partner_id: parseInt(partnerId, 10),
        round_id: roundId ? parseInt(roundId, 10) : undefined,
        amount_usd: parseFloat(amount),
        purpose: purpose.trim() || undefined,
        disbursement_method_id: methodId ? parseInt(methodId, 10) : undefined,
        isf_cleared: isfCleared,
      };
      if (overrideWindow) {
        payload.report_window_days = wd;
        const note = `[Reporting window override: ${wd}d — ${overrideReason.trim()}]`;
        payload.purpose = (purpose.trim() ? `${purpose.trim()} ` : '') + note;
      }
      const res = await api.post<CreateResp>(
        '/api/proximate/disbursements', payload,
      );
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

  // PRX-RBAC-013 — hard OB-only gate. Non-OB personas (donor, endorser,
  // platform admin) get a clean access-denied instead of the money form.
  if (!personaLoading && !isOb) {
    return (
      <PageShell>
        <PageMain>
          <div className="prox-panel max-w-md mx-auto text-center space-y-3" style={{ padding: '24px' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--prox-ink)' }}>
              {t('proximate.disbursements.ob_only_title') || 'This page is for the Oversight Body.'}
            </p>
            <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
              {t('proximate.disbursements.ob_only_body')
                || 'Recording disbursements is handled by the Adeso secretariat.'}
            </p>
            <Link href="/proximate/disbursements">
              <Button size="sm" variant="outline">
                {t('proximate.disbursements.back_to_list') || 'Back to disbursements'}
              </Button>
            </Link>
          </div>
        </PageMain>
      </PageShell>
    );
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
          <div className="prox-panel space-y-4" style={{ padding: '24px' }}>
            <div>
              <p className="text-sm" style={{ color: 'var(--prox-muted)' }}>
                {result.partner_name} — <span className="prox-mono" style={{ color: 'var(--prox-ink)', fontWeight: 600 }}>${result.amount_usd?.toLocaleString()}</span>
              </p>
              {result.report_due_at && (
                <p className="text-xs mt-1" style={{ color: 'var(--prox-muted)' }}>
                  {t('proximate.disbursements.due')}{' '}
                  {formatComplianceDate(result.report_due_at)}
                </p>
              )}
            </div>
            <div>
              <label className="prox-eyebrow block mb-1.5">
                {t('proximate.disbursements.share_link_label')}
              </label>
              <p className="text-xs mb-2" style={{ color: 'var(--prox-muted)' }}>
                {t('proximate.disbursements.share_link_hint')}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={url}
                  className="prox-mono flex-1 h-10 px-3 text-xs rounded-md"
                  style={{ background: 'var(--prox-inset)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
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
          </div>
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
        <div className="prox-panel space-y-4" style={{ padding: '24px' }}>
          <div>
            <label className="prox-eyebrow block mb-1.5">
              {t('proximate.disbursements.field_partner')} *
            </label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-md"
              style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
            >
              <option value="">— {t('proximate.disbursements.select_partner')} —</option>
              {visiblePartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.locality ? `(${p.locality})` : ''} — {p.status}
                  {/* OB-006/007 — mark obvious test records (option text only). */}
                  {/\b(uat|test|qa|codex|demo|fixture)\b/i.test(p.name) ? ' · TEST' : ''}
                </option>
              ))}
            </select>
            {/* OB-012 — when scoped to a round, say so, so the OB knows the
                list is the round's awarded partners, not every cleared org. */}
            {roundScoped && visiblePartners.length > 0 && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--prox-muted)' }}>
                {tf('proximate.disbursements.awarded_scope_note',
                    'Showing only partners awarded in the selected round.')}
              </p>
            )}
            {/* PRX-27JUL-DISB-001/002 — when a round has awarded partners that
                are NOT in this selector, say WHY (awarded ≠ ready-to-pay), so an
                awarded partner "missing" from the list reads as an explained
                gate, not a bug. Count = awarded − (awarded ∩ cleared). */}
            {roundScoped
              && (awardedIds?.length ?? 0) > visiblePartners.length && (
              <p className="mt-1 text-xs" style={{ color: 'var(--prox-warn)' }}>
                {tf('proximate.disbursements.awarded_not_ready_note',
                    'Some partners awarded in this round are not listed here yet — '
                    + 'awarded by the panel but not cleared for disbursement '
                    + '(contract, a verified payment route, or due-diligence '
                    + 'clearance is still incomplete).')}
              </p>
            )}
            {visiblePartners.length === 0 && roundScoped && (
              <div className="mt-2 rounded-md px-3 py-2.5" style={{ border: '1px solid color-mix(in srgb, var(--prox-warn) 40%, transparent)', background: 'var(--prox-warn-tint)' }}>
                <p className="text-xs" style={{ color: 'var(--prox-warn)' }}>
                  {tf('proximate.disbursements.no_awarded_cleared_partners',
                      'No partner in this round is both awarded by the panel and cleared for disbursement yet. Record the panel award and complete the partner’s clearance first.')}
                </p>
              </div>
            )}
            {visiblePartners.length === 0 && !roundScoped && (
              <div className="mt-2 rounded-md px-3 py-2.5" style={{ border: '1px solid color-mix(in srgb, var(--prox-warn) 40%, transparent)', background: 'var(--prox-warn-tint)' }}>
                <p className="text-xs" style={{ color: 'var(--prox-warn)' }}>
                  {t('proximate.disbursements.no_eligible_partners')}
                </p>
                {/* Phase 717 — actionable empty state: nominate → endorse
                    is the only way to get a fundable partner, so link it. */}
                <Link
                  href="/proximate/admin/partners/new"
                  className="mt-1.5 inline-flex text-xs font-semibold underline underline-offset-2 hover:no-underline"
                  style={{ color: 'var(--prox-warn)' }}
                >
                  {tf('proximate.disbursements.nominate_cta', 'Nominate a partner')} →
                </Link>
              </div>
            )}
          </div>

          {/* PRX-27JUL-DISB-001/002 — the readiness checklist only loads for a
              selected partner; before selection the OB saw nothing and read it
              as "no checklist". Say so explicitly so the checklist's absence is
              a prompt, not a gap. */}
          {!partnerId && visiblePartners.length > 0 && (
            <div className="rounded-md px-3 py-2.5" style={{ border: '1px dashed var(--prox-line)', background: 'var(--prox-inset)' }}>
              <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                {tf('proximate.disbursements.select_to_see_readiness',
                    'Select a partner to see the disbursement readiness checklist.')}
              </p>
            </div>
          )}

          {/* Phase 717 — why-blocked: exact missing preconditions before submit */}
          {preflight && (
            <WhyBlocked blockers={preflight.blockers} warnings={preflight.warnings} />
          )}

          {/* OB-012 (2026-07-27) — disbursement readiness checklist: every
              precondition for a release, each shown complete / still-missing,
              so money never moves against an incomplete gate. Round-scoped
              items (award, contract) appear when a round is selected. */}
          {preflight && preflight.checklist.length > 0 && (
            <div className="rounded-md px-3 py-2.5" style={{ border: '1px solid var(--prox-line)', background: 'var(--prox-inset)' }}>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--prox-ink)' }}>
                {tf('proximate.disbursements.readiness_title', 'Disbursement readiness')}
              </p>
              <ul className="space-y-1">
                {preflight.checklist.map((item) => (
                  <li key={item.code} className="flex items-center gap-2 text-xs">
                    {item.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--kuja-grow))] shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className={item.ok ? '' : 'text-muted-foreground'}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="prox-eyebrow block mb-1.5">
              {t('proximate.disbursements.field_round')}
            </label>
            <select
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-md"
              style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
            >
              <option value="">— {t('proximate.disbursements.no_round')} —</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>

          {/* PRX-DISB-001 — payment route. Records which verified method
              the money used. Auto-filled when the partner has one; a
              required pick when there are several. */}
          {methods.length > 0 && (
            <div>
              <label className="prox-eyebrow block mb-1.5">
                {t('proximate.disbursements.field_method') || 'Payment route'}
                {methods.length > 1 ? ' *' : ''}
              </label>
              <select
                value={methodId}
                onChange={(e) => setMethodId(e.target.value)}
                className="w-full h-10 px-3 text-sm rounded-md"
                style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
              >
                {methods.length > 1 && (
                  <option value="">— {t('proximate.disbursements.select_method') || 'Select the payment route'} —</option>
                )}
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display}{m.fsp?.kind ? ` (${m.fsp.kind})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="prox-eyebrow block mb-1.5">
                {t('proximate.disbursements.field_amount')} *
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-10 px-3 text-sm rounded-md"
                style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="prox-eyebrow block mb-1.5">
                {t('proximate.disbursements.field_window')}
              </label>
              <p className="text-xs mb-2 leading-snug" style={{ color: 'var(--prox-muted)' }}>
                {t('proximate.disbursements.window_default_note') === 'proximate.disbursements.window_default_note'
                  ? 'Reporting follows the contract’s implementation period, counted from the day the partner confirms receipt. Leave this off unless a specific override is needed.'
                  : t('proximate.disbursements.window_default_note')}
              </p>
              <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideWindow}
                  onChange={(e) => setOverrideWindow(e.target.checked)}
                />
                {t('proximate.disbursements.window_override_toggle') === 'proximate.disbursements.window_override_toggle'
                  ? 'Set a custom reporting window instead'
                  : t('proximate.disbursements.window_override_toggle')}
              </label>
              {overrideWindow && (
                <div className="space-y-2 pl-6">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={windowDays}
                    onChange={(e) => setWindowDays(e.target.value)}
                    placeholder="45"
                    className="w-full h-10 px-3 text-sm rounded-md"
                    style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
                  />
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder={t('proximate.disbursements.window_override_reason_ph') === 'proximate.disbursements.window_override_reason_ph'
                      ? 'Reason for the override'
                      : t('proximate.disbursements.window_override_reason_ph')}
                    className="w-full h-10 px-3 text-sm rounded-md"
                    style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="prox-eyebrow block mb-1.5">
              {t('proximate.disbursements.field_purpose')}
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2 text-sm rounded-md"
              style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line)', color: 'var(--prox-ink)' }}
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
              <span className="block mt-0.5" style={{ color: 'var(--prox-muted)' }}>
                {t('proximate.disbursements.isf_hint')}
              </span>
            </span>
          </label>

          {error && (
            <div className="text-sm rounded-md px-3 py-2" style={{ color: 'var(--prox-danger)', background: 'var(--prox-danger-tint)', border: '1px solid color-mix(in srgb, var(--prox-danger) 30%, transparent)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="prox-btn primary"
              style={{ opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 me-2" />
              )}
              {t('proximate.disbursements.record')}
            </button>
            <Link href="/proximate/disbursements">
              <Button variant="outline" disabled={submitting}>
                {t('proximate.disbursements.cancel')}
              </Button>
            </Link>
          </div>
        </div>
      </PageMain>
    </PageShell>
  );
}
