'use client';

/**
 * Proximate donor portal — Phase 682 (June 2026).
 *
 * Funder-facing dashboard at /proximate/donor. The donor authenticates
 * with the normal Kuja login; if they have a ProximateDonor row on
 * the active network (Phase 681), this page renders their portfolio.
 * Otherwise they see a "request access" notice pointing at the OB.
 *
 * Single-fetch design: /api/proximate/donors/me/dashboard returns
 * everything the landing view needs — donor row + per-round rollup
 * + portfolio totals.
 */

import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, FileText, AlertTriangle, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { api } from '@/lib/api';
import { labelForProximateStatus, labelForRoundType } from '@/lib/proximate-status-labels';
import { proxPillForStatus } from '@/components/proximate/status-badge';
import { computeFunnelTotals } from '@/components/proximate/donor-money-funnel';
import { AssurancePackButton } from '@/components/proximate/donor-assurance-pack';
import { DonorExplainer } from '@/components/proximate/donor-explainer';

interface Donor {
  id: number;
  display_name: string;
  contact_email: string | null;
  subscribed_round_ids: number[];
  auto_email_closing_pack: boolean;
}

interface RoundSummary {
  id: number;
  title: string;
  status: string;
  trigger_type: string;
  envelope_usd: number;
  disbursed_usd: number;
  disbursement_count: number;
  partners_served: number;
  flagged_count: number;
  outcome_attested: number;
  outcome_verified: number;
  outcome_pending: number;
  outcome_total: number;
  created_at: string | null;
  report_pdf_url: string;
  status_counts: Record<string, number>;
  status_totals_usd: Record<string, number>;
}

interface Portfolio {
  envelope_usd: number;
  // Money allocated from the donor's grants to rounds (SUM of grant
  // allocations) — the funnel's "Allocated" figure, matching the grant card.
  allocated_usd: number;
  disbursed_usd: number;
  partners_served: number;
  disbursement_count: number;
  outcome_attested: number;
  outcome_verified: number;
  outcome_pending: number;
  // Phase 697 — explicit denominator for the portfolio attestation
  // rate tile. The denominator must match the per-round card
  // (`outcome_total`), not `disbursement_count` — an obligation row
  // is spawned only at "verify" (Phase 678), so older disbursements
  // never had one. Old code: 3/9 = 33%. New code: 3/4 = 75% (matches
  // the round card).
  outcome_total: number;
  flagged_count: number;
}

interface DashboardPayload {
  donor: Donor;
  rounds: RoundSummary[];
  portfolio: Portfolio;
}

/** Subset of /api/proximate/grants (donor-scoped server-side) that the
 *  portal needs: the funnel's "Committed" stage and the per-grant
 *  assurance pack. */
interface DonorGrant {
  id: number;
  title: string;
  donor_grant_ref: string | null;
  amount_committed_usd: number | null;
  amount_allocated_usd: number | null;
  amount_remaining_usd: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

function pct(num: number, denom: number) {
  if (!denom) return null;
  return Math.round((num / denom) * 100);
}

function usd(n: number | null | undefined) {
  if (n == null) return '$0';
  return `$${n.toLocaleString()}`;
}

// Map a Proximate status to a design-system pill tone.

export function ProximateDonorClient() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // QA 2026-07-15 gap closure — the subscribe/unsubscribe endpoints
  // existed but the donor UI had no control. null = not touched yet;
  // falls back to the server-reported list.
  const [subscribedIds, setSubscribedIds] = useState<number[] | null>(null);
  // Grants are a SEPARATE fetch from the dashboard on purpose: the
  // dashboard endpoint is round-scoped and has no grant concept, and a
  // donor with no grant agreement on file is a legitimate state (the
  // funnel then shows Committed as "not recorded" rather than $0).
  // `null` = still loading / failed, which is NOT the same as `[]`.
  const [grants, setGrants] = useState<DonorGrant[] | null>(null);

  useEffect(() => {
    api
      .get<DashboardPayload>('/api/proximate/donors/me/dashboard')
      .then((r) => setData(r))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'load failed';
        // 403 → user is logged in but not a donor: show access notice
        if (/forbidden|registration required/i.test(msg)) {
          setError('NOT_A_DONOR');
        } else {
          setError(msg);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .get<{ grants: DonorGrant[] }>('/api/proximate/grants')
      .then((r) => setGrants(r.grants || []))
      .catch(() => setGrants([]));
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error === 'NOT_A_DONOR') {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="prox-panel space-y-3" style={{ padding: '24px' }}>
          <h1 className="text-2xl kuja-display">
            {t('proximate.donor.no_access_title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--prox-muted)' }}>
            {t('proximate.donor.no_access_body')}
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="prox-panel" style={{ padding: '24px' }}>
          <p className="text-sm" style={{ color: 'var(--prox-danger)' }}>{error || t('proximate.donor.load_failed')}</p>
        </div>
      </div>
    );
  }

  const { donor, rounds, portfolio } = data;
  const followedIds = subscribedIds ?? donor.subscribed_round_ids ?? [];

  const toggleFollow = async (roundId: number) => {
    const following = followedIds.includes(roundId);
    const next = following
      ? followedIds.filter((x) => x !== roundId)
      : [...followedIds, roundId];
    setSubscribedIds(next);
    try {
      await api.post(
        `/api/proximate/donors/me/${following ? 'unsubscribe' : 'subscribe'}`,
        { round_ids: [roundId] },
      );
    } catch {
      setSubscribedIds(followedIds);
    }
  };
  // Phase 697 — divide by outcome_total (number of obligation rows),
  // NOT disbursement_count. Matches the per-round card's math so the
  // top-card and round-card percentages can't drift apart.
  const outcomeRate = pct(portfolio.outcome_attested, portfolio.outcome_total);

  // "Committed" is only real when a signed grant agreement exists. A
  // donor whose grants haven't been recorded yet gets null (rendered as
  // "not recorded"); showing $0 would read as "you gave nothing", and
  // silently substituting the envelope would overstate what is on paper.
  const committedUsd = grants && grants.length > 0
    ? grants.reduce((sum, g) => sum + (g.amount_committed_usd || 0), 0)
    : null;
  const funnelTotals = computeFunnelTotals(rounds, committedUsd, portfolio.allocated_usd);
  const mtScale = Math.max(1, funnelTotals.committed_usd || funnelTotals.allocated_usd || funnelTotals.disbursed_usd || 1);
  const mtStages: Array<{ lab: string; val: number | null; sub: string; good?: boolean }> = [
    { lab: t('proximate.donor.mt_committed'), val: funnelTotals.committed_usd, sub: t('proximate.donor.mt_committed_sub') },
    { lab: t('proximate.donor.mt_allocated'), val: funnelTotals.allocated_usd, sub: t('proximate.donor.mt_allocated_sub') },
    { lab: t('proximate.donor.stat_disbursed'), val: funnelTotals.disbursed_usd, sub: `${portfolio.disbursement_count} ${t('proximate.donor.disbursements')}` },
    { lab: t('proximate.donor.mt_reported'), val: funnelTotals.reported_usd, sub: t('proximate.donor.mt_reported_sub') },
    { lab: t('proximate.donor.mt_verified'), val: funnelTotals.verified_usd, sub: t('proximate.donor.mt_verified_sub'), good: true },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <header>
        <div className="prox-eyebrow">{t('proximate.donor.portal_label')}</div>
        <h1 className="kuja-display mt-1.5 mb-1" style={{ fontSize: 27, lineHeight: 1.1 }}>{donor.display_name}</h1>
        {donor.contact_email && (
          <p className="text-sm" style={{ color: 'var(--prox-muted)' }}>{donor.contact_email}</p>
        )}
      </header>

      {/* Money trail — the hero. Committed → Allocated → Disbursed → Reported
          → Verified, every stage anchored to the audit chain. */}
      <div className="prox-panel">
        <div className="prox-phead">
          <h2>{t('proximate.donor.money_trail')}</h2>
          {portfolio.flagged_count > 0 && (
            <span className="prox-pill danger">{portfolio.flagged_count} {t('proximate.donor.flagged')}</span>
          )}
        </div>
        <div style={{ padding: '20px 18px 22px' }}>
          {/* Responsive funnel: five columns on desktop, a stacked vertical
              funnel on a phone so the stages + dollar amounts don't crush into
              a fixed 5-across grid (mobile-first). Each stage carries its own
              proportional bar. */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-x-3 gap-y-3.5">
            {mtStages.map((s, i) => (
              <div key={i} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <span
                    className="text-[11px] font-semibold uppercase"
                    style={{ letterSpacing: '.06em', color: s.good ? 'var(--prox-good)' : 'var(--prox-muted)' }}
                  >
                    {s.lab}
                  </span>
                  <div
                    className="prox-num"
                    style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: '-.02em', color: 'var(--prox-ink)' }}
                  >
                    {s.val == null ? t('proximate.donor.not_recorded') : usd(s.val)}
                  </div>
                </div>
                <div className={`prox-bar ${s.good ? 'good' : ''}`} style={{ marginTop: 8 }}>
                  <i style={{ width: s.val == null ? '0%' : `${Math.max(2, Math.round((s.val / mtScale) * 100))}%` }} />
                </div>
                <span className="text-[11px] block mt-1" style={{ color: 'var(--prox-muted)' }}>{s.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The three controls behind the funnel's last two stages. Donors
          consistently could not say what "verified" was worth without
          this; each entry explains what the control proves and what it
          does not. */}
      <AssuranceControlsStrip />

      {/* Portfolio rollup — secondary to the funnel now, but complete:
          partner/payment counts and the outcome-attestation rate live
          nowhere else. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="prox-stat">
          <div className="lab">{t('proximate.donor.stat_envelope')}</div>
          <div className="val prox-num">{usd(portfolio.envelope_usd)}</div>
        </div>
        <div className="prox-stat">
          <div className="lab">{t('proximate.donor.stat_disbursed')}</div>
          <div className="val prox-num">{usd(portfolio.disbursed_usd)}</div>
          {portfolio.envelope_usd > 0 && (
            <div className="meta">{pct(portfolio.disbursed_usd, portfolio.envelope_usd)}% {t('proximate.donor.of_envelope')}</div>
          )}
        </div>
        <div className="prox-stat">
          <div className="lab">{t('proximate.donor.stat_partners_served')}</div>
          <div className="val prox-num">{portfolio.partners_served}</div>
          <div className="meta">{portfolio.disbursement_count} {t('proximate.donor.disbursements')}</div>
        </div>
        <div className="prox-stat">
          <div className="lab">{t('proximate.donor.stat_outcome_data')} <DonorExplainer term="outcome_check" /></div>
          {portfolio.outcome_total === 0 ? (
            <>
              <div className="val" style={{ fontSize: 22, color: 'var(--prox-muted)' }}>—</div>
              <div className="meta">{t('proximate.donor.no_outcomes_due')}</div>
            </>
          ) : portfolio.outcome_attested === 0 ? (
            <>
              <div className="val" style={{ fontSize: 18 }}>{t('proximate.donor.outcomes_pending')}</div>
              <div className="meta">0/{portfolio.outcome_total} {t('proximate.donor.attested')}</div>
            </>
          ) : (
            <>
              <div className="val prox-num">{outcomeRate}%</div>
              <div className="meta">{portfolio.outcome_attested}/{portfolio.outcome_total} {t('proximate.donor.attested')}</div>
              {portfolio.outcome_verified > 0 && (
                <div className="meta">{t('proximate.donor.outcomes_verified_count', { count: portfolio.outcome_verified })}</div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Grants — the assurance pack's natural home: one pack covers a
          whole grant timeline across every round it funded. */}
      <DonorGrants grants={grants} />

      {portfolio.flagged_count > 0 && (
        <div className="prox-panel flex items-start gap-3" style={{ padding: '16px 18px', borderColor: 'var(--prox-danger)', background: 'var(--prox-danger-tint)' }}>
          <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: 'var(--prox-danger)' }} />
          <div>
            <h3 className="text-sm font-medium">
              {t('proximate.donor.flagged_warning_title')}
            </h3>
            <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>
              {portfolio.flagged_count} {t('proximate.donor.flagged_warning_body')}
            </p>
          </div>
        </div>
      )}

      {/* Partner implementation reports — published by the OB. */}
      <DonorPublishedReports />

      {/* Per-round cards */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('proximate.donor.rounds_title')}</h2>
        {rounds.length === 0 ? (
          <div className="prox-panel text-center text-sm" style={{ padding: '24px', color: 'var(--prox-muted)' }}>
            {t('proximate.donor.no_rounds')}
          </div>
        ) : (
          rounds.map((r) => (
            <div key={r.id} className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="kuja-display" style={{ fontSize: 16, fontWeight: 700 }}>{r.title}</h3>
                    <span className={`prox-pill ${proxPillForStatus(r.status)}`}>
                      {labelForProximateStatus(r.status, t)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {labelForRoundType(r.trigger_type, t)}
                    {r.created_at && (
                      <span> · {new Date(r.created_at).toLocaleDateString()}</span>
                    )}
                  </p>
                </div>
                <button
                  className="prox-btn ghost"
                  style={{ height: 34 }}
                  onClick={() => window.open(`/proximate/rounds/${r.id}/report`, '_self')}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('proximate.donor.view_full_report')}
                </button>
              </div>

              <dl className="grid gap-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.donor.stat_envelope')}
                  </dt>
                  <dd className="text-sm">{usd(r.envelope_usd)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.donor.stat_disbursed')}
                  </dt>
                  <dd className="text-sm">
                    {usd(r.disbursed_usd)}
                    {r.envelope_usd > 0 && (
                      <span className="text-xs text-muted-foreground ms-1">
                        ({pct(r.disbursed_usd, r.envelope_usd)}%)
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.donor.stat_partners_served')}
                  </dt>
                  <dd className="text-sm">{r.partners_served}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    {t('proximate.donor.stat_outcome_data')}
                    <DonorExplainer term="outcome_check" />
                  </dt>
                  <dd className="text-sm">
                    {/* QA-18: never show "0%" / "(0/0)" when nothing is
                        due yet — donors read it as poor performance. */}
                    {r.outcome_total === 0 ? (
                      <span className="text-muted-foreground">
                        {t('proximate.donor.no_outcomes_due')}
                      </span>
                    ) : r.outcome_attested === 0 ? (
                      <>
                        {t('proximate.donor.outcomes_pending')}
                        <span className="text-xs text-muted-foreground ms-1">
                          (0/{r.outcome_total})
                        </span>
                      </>
                    ) : (
                      <>
                        {pct(r.outcome_attested, r.outcome_total)}%
                        <span className="text-xs text-muted-foreground ms-1">
                          ({r.outcome_attested}/{r.outcome_total})
                        </span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>

              {Object.keys(r.status_counts).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(r.status_counts).map(([s, n]) => (
                    <span key={s} className={`prox-pill ${proxPillForStatus(s)}`}>
                      {n} {labelForProximateStatus(s, t)}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                {/* Replaces the old raw window.open on report_pdf_url:
                    that call dropped the X-Network-Override header and
                    rendered a 503/403 JSON body in a new tab while this
                    page still looked like the download worked. */}
                <AssurancePackButton scope="round" id={r.id} variant="outline" />
                <button
                  className="prox-btn ghost"
                  style={{ height: 32, fontSize: 12.5 }}
                  onClick={() => toggleFollow(r.id)}
                >
                  {followedIds.includes(r.id)
                    ? t('proximate.donor.following')
                    : t('proximate.donor.follow')}
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <AskBox />

      <p className="text-xs text-muted-foreground pt-4 border-t">
        {t('proximate.donor.footer_honest_scope')}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assurance controls — the three things standing behind "Verified".
   Named and explained in donor language, because "verified" on its own
   is worth whatever the reader assumes it is worth.                    */
/* ------------------------------------------------------------------ */

function AssuranceControlsStrip() {
  const { t } = useTranslation();
  const controls = ['audit_anchor', 'verifier_attestation', 'outcome_check'] as const;
  return (
    <div className="prox-panel" style={{ padding: '16px 18px' }}>
      <h2 className="kuja-display flex items-center gap-2 mb-2.5" style={{ fontSize: 15, fontWeight: 700 }}>
        <ShieldCheck className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
        {t('proximate.donor.controls_title')}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-3">
        {controls.map((c) => (
          <li key={c} className="text-xs">
            <span className="font-medium inline-flex items-center gap-1">
              {t(`proximate.donor.explain.${c}.title`)}
              <DonorExplainer term={c} />
            </span>
            <p className="mt-0.5" style={{ color: 'var(--prox-muted)' }}>
              {t(`proximate.donor.explain.${c}.short`)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grants — one assurance pack per grant, covering the whole timeline.  */
/* ------------------------------------------------------------------ */

function DonorGrants({ grants }: { grants: DonorGrant[] | null }) {
  const { t } = useTranslation();
  // null = the grants call hasn't landed (or failed). Rendering nothing
  // is right: an empty "Your grants" heading would imply the donor has
  // none, which we do not know yet.
  if (!grants || grants.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{t('proximate.donor.grants_title')}</h2>
      {grants.map((g) => (
        <div key={g.id} className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="kuja-display" style={{ fontSize: 16, fontWeight: 700 }}>{g.title}</h3>
                <span className={`prox-pill ${proxPillForStatus(g.status)}`}>
                  {labelForProximateStatus(g.status, t)}
                </span>
              </div>
              {g.donor_grant_ref && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--prox-muted)' }}>{g.donor_grant_ref}</p>
              )}
            </div>
            <AssurancePackButton scope="grant" id={g.id} showHint />
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                {t('proximate.donor.funnel.stage.committed')}
              </dt>
              <dd className="prox-mono text-sm">{usd(g.amount_committed_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                {t('proximate.donor.funnel.stage.allocated')}
              </dt>
              <dd className="prox-mono text-sm">{usd(g.amount_allocated_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs" style={{ color: 'var(--prox-muted)' }}>
                {t('proximate.donor.grant_remaining')}
              </dt>
              <dd className="prox-mono text-sm">{usd(g.amount_remaining_usd)}</dd>
            </div>
          </dl>
        </div>
      ))}
    </section>
  );
}

function AskBox() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ fallback_used?: boolean; rounds_scope?: number[] } | null>(null);

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    setA(null);
    try {
      const r = await api.post<{ answer: string; meta?: { fallback_used?: boolean; rounds_scope?: number[] } }>(
        '/api/proximate/donors/me/ask',
        { question: q.trim() },
      );
      setA(r.answer);
      setMeta(r.meta || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prox-panel space-y-3" style={{ padding: '16px 18px' }}>
      <h3 className="kuja-display flex items-center gap-2" style={{ fontSize: 15, fontWeight: 700 }}>
        <MessageCircle className="w-4 h-4" />
        {t('proximate.donor.ask_title')}
      </h3>
      <p className="text-xs" style={{ color: 'var(--prox-muted)' }}>{t('proximate.donor.ask_hint')}</p>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && q.trim() && !busy) ask();
          }}
          placeholder={t('proximate.donor.ask_placeholder')}
          maxLength={1000}
          className="flex-1 h-10 px-3 text-sm rounded-md"
          style={{ background: 'var(--prox-surface)', border: '1px solid var(--prox-line-2)' }}
          disabled={busy}
        />
        <button
          onClick={ask}
          disabled={busy || !q.trim()}
          className="prox-btn primary disabled:opacity-50"
          style={{ height: 40, padding: '0 14px' }}
          aria-label={t('proximate.donor.ask_title')}
          title={t('proximate.donor.ask_title')}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {err && <p className="text-sm" style={{ color: 'var(--prox-danger)' }}>{err}</p>}
      {a && (
        <div className="mt-2 p-3 rounded-md text-sm whitespace-pre-wrap" style={{ background: 'var(--prox-inset)' }}>
          {a}
          {meta?.fallback_used && (
            <p className="text-xs mt-2" style={{ color: 'var(--prox-warn)' }}>
              {t('proximate.donor.ask_fallback_note')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partner implementation reports — packages the OB published for
   this donor's rounds. Each opens the full web report (narrative,
   approved gallery, financials) with a PDF export.                    */
/* ------------------------------------------------------------------ */

interface PublishedReport {
  id: number;
  partner_name: string | null;
  round_title: string | null;
  published_at: string | null;
}

function DonorPublishedReports() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<PublishedReport[] | null>(null);

  useEffect(() => {
    api.get<{ packages: PublishedReport[] }>(
      '/api/proximate/donors/me/report-packages',
    ).then((r) => setReports(r.packages)).catch(() => setReports([]));
  }, []);

  if (!reports || reports.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <FileText className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
        {t('proximate.donor.partner_reports')}
      </h2>
      {/* QA-18 items 9+10 — donor-grade report cards: partner name as
          the title, round + date as metadata, a Published badge, and
          "View report" as the unmistakable primary action with the PDF
          as secondary. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((r) => (
          <div
            key={r.id}
            className="prox-panel space-y-2.5 transition cursor-pointer hover:bg-[color:var(--prox-surface-2)]"
            style={{ padding: '16px 18px' }}
            onClick={() => { window.location.href = `/proximate/reports/${r.id}`; }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="kuja-display truncate" style={{ fontSize: 14, fontWeight: 700 }}>{r.partner_name}</p>
              <span className="prox-pill good shrink-0">
                {labelForProximateStatus('published', t)}
              </span>
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--prox-muted)' }}>
              {r.round_title}
              {r.published_at &&
                ` · ${new Date(r.published_at).toLocaleDateString()}`}
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <button className="prox-btn primary" style={{ height: 28, fontSize: 12 }} onClick={(e) => {
                e.stopPropagation();
                window.location.href = `/proximate/reports/${r.id}`;
              }}>
                {t('proximate.donor.view_report')}
              </button>
              <button className="prox-btn ghost" style={{ height: 28, fontSize: 12 }} onClick={(e) => {
                e.stopPropagation();
                window.open(
                  `${process.env.NEXT_PUBLIC_API_BASE || ''}/api/proximate/report-packages/${r.id}/pdf`,
                  '_blank',
                );
              }}>
                <FileText className="w-3.5 h-3.5" />
                {t('proximate.donor.download_pdf')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
