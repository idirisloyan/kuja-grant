'use client';

/**
 * Partner mini-portal — Phase 689 (June 2026).
 *
 * Long-lived token URL the partner uses to see their full disbursement
 * history, outcome obligations, and OB acknowledgements in one place.
 *
 *   /proximate-partner?t=<long-lived-token>
 *
 * No login required — the token IS the credential. Same pattern as
 * Phase 652 disbursement-report and Phase 679 outcome-attestation.
 */

import { useEffect, useState } from 'react';
import { Loader2, FileText, MessageSquare, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

interface Outcome {
  id: number;
  status: string;
  due_at: string | null;
  submitted_at: string | null;
  report_token: string | null;
  has_counterfactual: boolean;
  ack_message: string | null;
}

interface Disbursement {
  id: number;
  amount_usd: number | null;
  purpose: string | null;
  status: string;
  sent_at: string | null;
  report_due_at: string | null;
  report_submitted_at: string | null;
  report_token: string | null;
  ack_message: string | null;
  ack_message_at: string | null;
  outcome: Outcome | null;
}

interface PartnerPortalPayload {
  partner: {
    id: number;
    name: string;
    status: string;
    capital_class: string | null;
    dd_cleared_at: string | null;
  };
  disbursements: Disbursement[];
}

const STATUS_TONE: Record<string, string> = {
  pending_cosign: 'bg-violet-100 text-violet-800 border-violet-300',
  pending_report: 'bg-amber-100 text-amber-800 border-amber-300',
  reported: 'bg-blue-100 text-blue-800 border-blue-300',
  verified: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  flagged: 'bg-red-100 text-red-800 border-red-300',
};

export default function ProximatePartnerPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<PartnerPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tk = url.searchParams.get('t');
    if (!tk) {
      setError(t('proximate.partner.missing_token'));
      setLoading(false);
      return;
    }
    fetch(
      `${API_BASE}/api/proximate/partner-mini-portal/${encodeURIComponent(tk)}`,
      { headers: { 'X-Network-Override': 'proximate' } },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || !body.success) {
          setError(body.error || t('proximate.partner.load_failed'));
        } else {
          setData(body);
        }
      })
      .catch(() => setError(t('proximate.partner.load_failed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600">{error || t('proximate.partner.load_failed')}</p>
          </Card>
        </div>
      </div>
    );
  }

  const pendingObligations = data.disbursements.filter(
    (d) => d.status === 'pending_report'
      || (d.outcome && d.outcome.status === 'pending'),
  );

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('proximate.partner.portal_label')}
          </p>
          <h1 className="text-2xl kuja-display">{data.partner.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t('proximate.partner.status_prefix')} {data.partner.status}
            {data.partner.dd_cleared_at && (
              <span>
                {' · '}{t('proximate.partner.cleared_prefix')}{' '}
                {new Date(data.partner.dd_cleared_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </header>

        {pendingObligations.length > 0 && (
          <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium">
                {t('proximate.partner.pending_obligations_title')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {pendingObligations.length}{' '}
                {t('proximate.partner.pending_obligations_body')}
              </p>
            </div>
          </Card>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-medium">
            {t('proximate.partner.disbursements_title')}
          </h2>
          {data.disbursements.length === 0 ? (
            <Card className="p-6 text-sm text-center text-muted-foreground">
              {t('proximate.partner.no_disbursements')}
            </Card>
          ) : (
            data.disbursements.map((d) => (
              <Card key={d.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">
                      ${d.amount_usd?.toLocaleString() || '—'}
                      {d.purpose && (
                        <span className="font-normal text-muted-foreground">
                          {' · '}{d.purpose}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.sent_at && new Date(d.sent_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded border ${
                      STATUS_TONE[d.status] || 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {d.status}
                  </span>
                </div>

                {d.status === 'pending_report' && d.report_token && (
                  <a
                    href={`/proximate-report?t=${d.report_token}`}
                    className="inline-block text-sm text-blue-600 hover:underline"
                  >
                    <FileText className="w-4 h-4 inline me-1" />
                    {t('proximate.partner.submit_report_cta')}
                  </a>
                )}

                {d.ack_message && (
                  <div className="text-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {t('proximate.partner.ack_from_adeso')}
                    </p>
                    <p className="whitespace-pre-wrap">{d.ack_message}</p>
                  </div>
                )}

                {d.outcome && (
                  <div className="border-t pt-3 text-xs space-y-2">
                    <p className="font-medium text-sm">
                      {t('proximate.partner.outcome_section')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('proximate.partner.outcome_status_prefix')}{' '}
                      <span className="font-medium">{d.outcome.status}</span>
                      {d.outcome.due_at && (
                        <span>
                          {' · '}{t('proximate.partner.outcome_due_prefix')}{' '}
                          {new Date(d.outcome.due_at).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                    {d.outcome.status === 'pending' && d.outcome.report_token && (
                      <a
                        href={`/proximate-outcome?t=${d.outcome.report_token}`}
                        className="inline-block text-blue-600 hover:underline"
                      >
                        {t('proximate.partner.outcome_attest_cta')}
                      </a>
                    )}
                    {d.outcome.ack_message && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded p-3 text-sm">
                        <p className="whitespace-pre-wrap">{d.outcome.ack_message}</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))
          )}
        </section>

        <p className="text-xs text-muted-foreground pt-3 border-t">
          {t('proximate.partner.footer_keep_link_safe')}
        </p>
      </div>
    </div>
  );
}
