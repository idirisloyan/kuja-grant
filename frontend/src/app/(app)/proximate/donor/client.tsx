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
import { Loader2, ExternalLink, FileText, AlertTriangle, MessageCircle, Send } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';

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

      {/* Portfolio rollup */}
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
          <p className="text-xs text-muted-foreground">
            {t('proximate.donor.stat_outcome_data')}
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
            </>
          )}
        </Card>
      </section>

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
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-base font-medium">{r.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {r.trigger_type} · {r.status}
                    {r.created_at && (
                      <span> · {new Date(r.created_at).toLocaleDateString()}</span>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={followedIds.includes(r.id) ? 'secondary' : 'outline'}
                  onClick={() => toggleFollow(r.id)}
                >
                  {followedIds.includes(r.id)
                    ? t('proximate.donor.following')
                    : t('proximate.donor.follow')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(`${process.env.NEXT_PUBLIC_API_BASE || ''}${r.report_pdf_url}`, '_blank')
                  }
                >
                  <FileText className="w-4 h-4 me-1" />
                  {t('proximate.donor.download_pdf')}
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
                  <dt className="text-xs text-muted-foreground">
                    {t('proximate.donor.stat_outcome_data')}
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
                      className={`px-2 py-1 rounded border ${
                        s === 'flagged'
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : s === 'verified'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {n} {labelForProximateStatus(s, t)}
                    </span>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(`/proximate/rounds/${r.id}/report`, '_self')}
              >
                <ExternalLink className="w-4 h-4 me-1" />
                {t('proximate.donor.view_full_report')}
              </Button>
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
      <div className="grid gap-2 sm:grid-cols-2">
        {reports.map((r) => (
          <a key={r.id} href={`/proximate/reports/${r.id}`}>
            <Card className="p-3 hover:bg-muted/40 transition space-y-1">
              <p className="text-sm font-medium truncate">{r.partner_name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {r.round_title}
                {r.published_at &&
                  ` · ${new Date(r.published_at).toLocaleDateString()}`}
              </p>
              <p className="text-[11px] text-primary inline-flex items-center gap-1">
                View report <ExternalLink className="w-3 h-3" />
              </p>
            </Card>
          </a>
        ))}
      </div>
    </section>
  );
}
