'use client';

/**
 * End-of-round report — Phase 659.
 *
 * Printable bundle for the OB / auditor at round close. Lists every
 * disbursement with its 5Q report payload, status counts, envelope used
 * vs remaining, and the audit-chain anchor. Use the browser print
 * dialog (Ctrl/Cmd-P) to save as PDF.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { useTranslation } from '@/lib/hooks/use-translation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ReportPayload {
  activity_happened?: boolean;
  people_helped?: number | null;
  issues?: string | null;
  spend_summary?: string | null;
  source?: string | null;
}

interface ReportRow {
  disbursement_id: number;
  partner_id: number;
  partner_name: string | null;
  partner_locality: string | null;
  amount_usd: number;
  purpose: string | null;
  sent_at: string | null;
  status: string;
  report: ReportPayload | null;
  report_voice_transcript: string | null;
  has_voice: boolean;
  has_photo: boolean;
  report_submitted_at: string | null;
}

interface ReportBundle {
  round: {
    id: number;
    title: string;
    title_ar?: string | null;
    trigger_type?: string | null;
    trigger_summary?: string | null;
    target_country?: string | null;
    donor_name?: string | null;
    envelope_usd?: number | null;
    status?: string;
  };
  window: { opened_at: string | null; closed_at: string | null };
  envelope: {
    total_usd: number | null;
    used_usd: number;
    remaining_usd: number | null;
    partners_served: number;
    disbursement_count: number;
  };
  status_counts: Record<string, number>;
  status_totals_usd: Record<string, number>;
  disbursements: ReportRow[];
  audit_anchor: {
    latest_seq: number | null;
    latest_hash: string | null;
    row_count: number;
  };
}

interface Resp extends ReportBundle { success: boolean }

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function ProximateRoundReportClient() {
  const { t } = useTranslation();
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<ReportBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (rid: number) => {
    try {
      const r = await api.get<Resp>(`/api/proximate/rounds/${rid}/report`);
      setData(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('proximate.round_report.load_failed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const m = window.location.pathname.match(/\/proximate\/rounds\/(\d+)\/report/);
    const rid = m ? parseInt(m[1], 10) : NaN;
    if (!rid || Number.isNaN(rid)) {
      setError(t('proximate.round_report.bad_url'));
      setLoading(false);
      return;
    }
    setId(rid);
    fetchData(rid);
  }, [fetchData, t]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('proximate.round_report.loading')}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="p-6 text-center">
          <p className="text-sm text-red-600">{error || t('proximate.round_report.load_failed')}</p>
          {id && (
            <Link href={`/proximate/rounds/${id}`}>
              <Button variant="outline" size="sm" className="mt-3">
                <ArrowLeft className="w-3.5 h-3.5 me-1" />
                {t('proximate.round_report.back_to_round')}
              </Button>
            </Link>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 print:p-0 print:max-w-none space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={id ? `/proximate/rounds/${id}` : '/proximate/rounds'}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 me-1" />
            {t('proximate.round_report.back_to_round')}
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 me-1" />
          {t('proximate.round_report.print')}
        </Button>
      </div>

      <header className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold">{data.round.title}</h1>
        {data.round.title_ar && (
          <p className="text-lg text-muted-foreground" dir="rtl">{data.round.title_ar}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          {t('proximate.round_report.subtitle')}
        </p>
        <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
          {data.round.trigger_type && (
            <span><strong>{t('proximate.round_report.trigger')}:</strong> {data.round.trigger_type}</span>
          )}
          {data.round.donor_name && (
            <span><strong>{t('proximate.round_report.donor')}:</strong> {data.round.donor_name}</span>
          )}
          {data.round.target_country && (
            <span><strong>{t('proximate.round_report.country')}:</strong> {data.round.target_country}</span>
          )}
        </div>
      </header>

      {/* Envelope rollup */}
      <section>
        <h2 className="text-base font-semibold mb-3">{t('proximate.round_report.envelope_summary')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{t('proximate.round_report.envelope_total')}</div>
            <div className="font-semibold">{fmt(data.envelope.total_usd)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('proximate.round_report.envelope_used')}</div>
            <div className="font-semibold">{fmt(data.envelope.used_usd)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('proximate.round_report.envelope_remaining')}</div>
            <div className="font-semibold">{fmt(data.envelope.remaining_usd)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('proximate.round_report.partners_served')}</div>
            <div className="font-semibold">{data.envelope.partners_served}</div>
          </div>
        </div>
      </section>

      {/* Status breakdown */}
      <section>
        <h2 className="text-base font-semibold mb-3">{t('proximate.round_report.status_breakdown')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {(['verified', 'flagged', 'reported', 'pending_report'] as const).map((s) => (
            <div key={s} className="border border-border rounded p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                {labelForProximateStatus(s, t)}
              </div>
              <div className="font-semibold mt-1">
                {data.status_counts[s] || 0} · {fmt(data.status_totals_usd[`${s.replace('_report', '')}_usd`] || 0)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Per-disbursement detail */}
      <section>
        <h2 className="text-base font-semibold mb-3">
          {t('proximate.round_report.disbursements_n', { n: data.disbursements.length })}
        </h2>
        {data.disbursements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('proximate.round_report.no_disbursements')}</p>
        ) : (
          <ul className="space-y-4">
            {data.disbursements.map((d) => (
              <li key={d.disbursement_id} className="border border-border rounded p-4 break-inside-avoid">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-medium">
                      {d.partner_name || `Partner #${d.partner_id}`}
                      {d.partner_locality && (
                        <span className="text-xs text-muted-foreground ms-2">{d.partner_locality}</span>
                      )}
                    </div>
                    {d.purpose && <div className="text-xs text-muted-foreground mt-0.5">{d.purpose}</div>}
                    <div className="text-xs text-muted-foreground mt-1">
                      {d.sent_at && <span>{t('proximate.round_report.sent')} {new Date(d.sent_at).toLocaleDateString()}</span>}
                      {d.report_submitted_at && (
                        <span> · {t('proximate.round_report.reported_on')} {new Date(d.report_submitted_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmt(d.amount_usd)}</div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{labelForProximateStatus(d.status, t)}</div>
                  </div>
                </div>

                {d.report && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">{t('proximate.report.q1_happened')}</dt>
                      <dd>{d.report.activity_happened ? t('proximate.report.yes') : t('proximate.report.no')}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('proximate.report.q2_people_helped')}</dt>
                      <dd>{d.report.people_helped ?? '—'}</dd>
                    </div>
                    {d.report.issues && (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">{t('proximate.report.q3_issues')}</dt>
                        <dd className="whitespace-pre-wrap">{d.report.issues}</dd>
                      </div>
                    )}
                    {d.report.spend_summary && (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">{t('proximate.report.q5_spend')}</dt>
                        <dd className="whitespace-pre-wrap">{d.report.spend_summary}</dd>
                      </div>
                    )}
                    {d.report_voice_transcript && (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">{t('proximate.disbursement.voice_transcript')}</dt>
                        <dd className="italic whitespace-pre-wrap">{d.report_voice_transcript}</dd>
                      </div>
                    )}
                    {(d.has_voice || d.has_photo) && (
                      <div className="sm:col-span-2 text-muted-foreground">
                        {d.has_voice && t('proximate.round_report.voice_attached')}
                        {d.has_voice && d.has_photo && ' · '}
                        {d.has_photo && t('proximate.round_report.photo_attached')}
                      </div>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Audit anchor */}
      <section className="border-t border-border pt-4 text-xs text-muted-foreground">
        <p>
          {t('proximate.round_report.audit_anchor_label')}: <span className="font-mono">{data.audit_anchor.latest_hash?.slice(0, 16) || '—'}</span>
          {' '}
          ({t('proximate.round_report.audit_rows', { n: data.audit_anchor.row_count })})
        </p>
        <p className="mt-1">
          {t('proximate.round_report.window_label')}:
          {' '}
          {data.window.opened_at && new Date(data.window.opened_at).toLocaleString()}
          {' → '}
          {data.window.closed_at && new Date(data.window.closed_at).toLocaleString()}
        </p>
      </section>
    </div>
  );
}
