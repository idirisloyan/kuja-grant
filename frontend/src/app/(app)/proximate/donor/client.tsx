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
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { TONE_CLASSES, toneForProximateStatus } from '@/components/proximate/status-badge';
import { DonorMoneyFunnel, computeFunnelTotals } from '@/components/proximate/donor-money-funnel';
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
        <Card className="p-6 space-y-3">
          <h1 className="text-2xl kuja-display">
            {t('proximate.donor.no_access_title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('proximate.donor.no_access_body')}
          </p>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <Card className="p-6">
          <p className="text-sm text-red-600">{error || t('proximate.donor.load_failed')}</p>
        </Card>
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
  const funnelTotals = computeFunnelTotals(rounds, committedUsd);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <header>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {t('proximate.donor.portal_label')}
        </p>
        <h1 className="text-2xl kuja-display">{donor.display_name}</h1>
        {donor.contact_email && (
          <p className="text-sm text-muted-foreground">{donor.contact_email}</p>
        )}
      </header>

      {/* Hero: the money story. Committed → Allocated → Disbursed →
          Reported → Verified. The stat grid below it keeps every number
          the grid used to lead with, one level down the hierarchy. */}
      <DonorMoneyFunnel
        totals={funnelTotals}
        flaggedCount={portfolio.flagged_count}
      />

      {/* The three controls behind the funnel's last two stages. Donors
          consistently could not say what "verified" was worth without
          this; each entry explains what the control proves and what it
          does not. */}
      <AssuranceControlsStrip />

      {/* Portfolio rollup — secondary to the funnel now, but complete:
          partner/payment counts and the outcome-attestation rate live
          nowhere else. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">
            {t('proximate.donor.stat_envelope')}
          </p>
          <p className="text-2xl font-medium">{usd(portfolio.envelope_usd)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">
            {t('proximate.donor.stat_disbursed')}
          </p>
          <p className="text-2xl font-medium">{usd(portfolio.disbursed_usd)}</p>
          {portfolio.envelope_usd > 0 && (
            <p className="text-xs text-muted-foreground">
              {pct(portfolio.disbursed_usd, portfolio.envelope_usd)}%{' '}
              {t('proximate.donor.of_envelope')}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">
            {t('proximate.donor.stat_partners_served')}
          </p>
          <p className="text-2xl font-medium">{portfolio.partners_served}</p>
          <p className="text-xs text-muted-foreground">
            {portfolio.disbursement_count} {t('proximate.donor.disbursements')}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            {t('proximate.donor.stat_outcome_data')}
            <DonorExplainer term="outcome_check" />
          </p>
          {portfolio.outcome_total === 0 ? (
            <>
              <p className="text-2xl font-medium text-muted-foreground">—</p>
              <p className="text-xs text-muted-foreground">
                {t('proximate.donor.no_outcomes_due')}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-medium">
                {portfolio.outcome_attested === 0
                  ? t('proximate.donor.outcomes_pending')
                  : `${outcomeRate}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {portfolio.outcome_attested}/{portfolio.outcome_total}{' '}
                {t('proximate.donor.attested')}
              </p>
              {/* outcome_verified was already in the payload but never
                  rendered — it is the stronger signal of the two and a
                  donor asking "who checked?" had no answer on screen. */}
              {portfolio.outcome_verified > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('proximate.donor.outcomes_verified_count', {
                    count: portfolio.outcome_verified,
                  })}
                </p>
              )}
            </>
          )}
        </Card>
      </section>

      {/* Grants — the assurance pack's natural home: one pack covers a
          whole grant timeline across every round it funded. */}
      <DonorGrants grants={grants} />

      {portfolio.flagged_count > 0 && (
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium">
              {t('proximate.donor.flagged_warning_title')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {portfolio.flagged_count} {t('proximate.donor.flagged_warning_body')}
            </p>
          </div>
        </Card>
      )}

      {/* Partner implementation reports — published by the OB. */}
      <DonorPublishedReports />

      {/* Per-round cards */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('proximate.donor.rounds_title')}</h2>
        {rounds.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {t('proximate.donor.no_rounds')}
          </Card>
        ) : (
          rounds.map((r) => (
            <Card key={r.id} className="p-4 space-y-3">
              {/* QA-18 item 11 — one clear hierarchy: title + status up
                  top, ONE primary action (the full round report), and
                  the secondary actions grouped consistently below. */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-medium">{r.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${TONE_CLASSES[toneForProximateStatus(r.status)]}`}>
                      {labelForProximateStatus(r.status, t)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.trigger_type}
                    {r.created_at && (
                      <span> · {new Date(r.created_at).toLocaleDateString()}</span>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => window.open(`/proximate/rounds/${r.id}/report`, '_self')}
                >
                  <ExternalLink className="w-4 h-4 me-1" />
                  {t('proximate.donor.view_full_report')}
                </Button>
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
                <div className="flex gap-2 flex-wrap text-xs">
                  {Object.entries(r.status_counts).map(([s, n]) => (
                    <span
                      key={s}
                      className={`px-2 py-1 rounded border ${TONE_CLASSES[toneForProximateStatus(s)]}`}
                    >
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleFollow(r.id)}
                >
                  {followedIds.includes(r.id)
                    ? t('proximate.donor.following')
                    : t('proximate.donor.follow')}
                </Button>
              </div>
            </Card>
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
    <Card className="p-4">
      <h2 className="text-sm font-medium flex items-center gap-2 mb-2.5">
        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
        {t('proximate.donor.controls_title')}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-3">
        {controls.map((c) => (
          <li key={c} className="text-xs">
            <span className="font-medium inline-flex items-center gap-1">
              {t(`proximate.donor.explain.${c}.title`)}
              <DonorExplainer term={c} />
            </span>
            <p className="text-muted-foreground mt-0.5">
              {t(`proximate.donor.explain.${c}.short`)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
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
        <Card key={g.id} className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-base font-medium">{g.title}</h3>
              <p className="text-xs text-muted-foreground">
                {g.donor_grant_ref && <span>{g.donor_grant_ref} · </span>}
                {labelForProximateStatus(g.status, t)}
              </p>
            </div>
            <AssurancePackButton scope="grant" id={g.id} showHint />
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('proximate.donor.funnel.stage.committed')}
              </dt>
              <dd className="text-sm">{usd(g.amount_committed_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('proximate.donor.funnel.stage.allocated')}
              </dt>
              <dd className="text-sm">{usd(g.amount_allocated_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('proximate.donor.grant_remaining')}
              </dt>
              <dd className="text-sm">{usd(g.amount_remaining_usd)}</dd>
            </div>
          </dl>
        </Card>
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
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <MessageCircle className="w-4 h-4" />
        {t('proximate.donor.ask_title')}
      </h3>
      <p className="text-xs text-muted-foreground">{t('proximate.donor.ask_hint')}</p>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && q.trim() && !busy) ask();
          }}
          placeholder={t('proximate.donor.ask_placeholder')}
          maxLength={1000}
          className="flex-1 h-10 px-3 text-sm bg-background border border-border rounded-md"
          disabled={busy}
        />
        <Button onClick={ask} disabled={busy || !q.trim()} size="sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {a && (
        <div className="mt-2 p-3 bg-muted/50 rounded-md text-sm whitespace-pre-wrap">
          {a}
          {meta?.fallback_used && (
            <p className="text-xs text-amber-700 mt-2">
              {t('proximate.donor.ask_fallback_note')}
            </p>
          )}
        </div>
      )}
    </Card>
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
        <FileText className="w-4 h-4 text-muted-foreground" />
        Partner reports
      </h2>
      {/* QA-18 items 9+10 — donor-grade report cards: partner name as
          the title, round + date as metadata, a Published badge, and
          "View report" as the unmistakable primary action with the PDF
          as secondary. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((r) => (
          <Card
            key={r.id}
            className="p-4 space-y-2.5 hover:shadow-md hover:border-[hsl(var(--kuja-clay))]/40 transition cursor-pointer"
            onClick={() => { window.location.href = `/proximate/reports/${r.id}`; }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold truncate">{r.partner_name}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${TONE_CLASSES.positive}`}>
                {labelForProximateStatus('published', t)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {r.round_title}
              {r.published_at &&
                ` · ${new Date(r.published_at).toLocaleDateString()}`}
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <Button size="sm" className="h-7 text-xs" onClick={(e) => {
                e.stopPropagation();
                window.location.href = `/proximate/reports/${r.id}`;
              }}>
                View report
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => {
                e.stopPropagation();
                window.open(
                  `${process.env.NEXT_PUBLIC_API_BASE || ''}/api/proximate/report-packages/${r.id}/pdf`,
                  '_blank',
                );
              }}>
                <FileText className="w-3.5 h-3.5 me-1" />
                Download PDF
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
