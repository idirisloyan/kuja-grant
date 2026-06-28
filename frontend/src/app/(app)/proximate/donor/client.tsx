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
import { Loader2, ExternalLink, FileText, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

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
  flagged_count: number;
}

interface DashboardPayload {
  donor: Donor;
  using_fallback_listing: boolean;
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

  const { donor, rounds, portfolio, using_fallback_listing } = data;
  const outcomeRate = pct(portfolio.outcome_attested, portfolio.disbursement_count);

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

      {using_fallback_listing && (
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
          <p className="text-sm">{t('proximate.donor.fallback_listing_notice')}</p>
        </Card>
      )}

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
          <p className="text-2xl font-medium">
            {outcomeRate != null ? `${outcomeRate}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {portfolio.outcome_attested}/{portfolio.disbursement_count}{' '}
            {t('proximate.donor.attested')}
          </p>
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
                    {r.outcome_total
                      ? `${pct(r.outcome_attested, r.outcome_total)}%`
                      : '—'}
                    <span className="text-xs text-muted-foreground ms-1">
                      ({r.outcome_attested}/{r.outcome_total})
                    </span>
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
                      {n} {s}
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

      <p className="text-xs text-muted-foreground pt-4 border-t">
        {t('proximate.donor.footer_honest_scope')}
      </p>
    </div>
  );
}
