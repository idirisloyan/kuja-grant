'use client';

/**
 * Donor money-trail / traceability — Phase 717.
 *
 * Renders GET /api/proximate/grants/<id>/traceability:
 * Grant -> round allocations -> disbursements -> partner reports ->
 * outcomes -> hash-chained audit anchors. Query-param route (?grant=<id>)
 * to stay static-export-safe. Visible to OB and the owning donor.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Link2, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { labelForProximateStatus } from '@/lib/proximate-status-labels';
import { proxPillForStatus } from '@/components/proximate/status-badge';
import { useTranslation } from '@/lib/hooks/use-translation';
import { PageShell, PageHeader, PageMain } from '@/components/layout/page-shell';

interface Disb {
  id: number; amount_usd: number; status: string; partner_name: string;
  report_submitted: boolean; verifier_verdict: string | null;
  outcome: unknown | null;
  audit_anchor: { seq: number; payload_hash: string; action: string } | null;
}
interface ChainRow {
  round: { id: number; title: string; status: string | null; allocation_usd: number };
  disbursements: Disb[];
}
interface Trace {
  success: boolean;
  grant: { id: number; title: string; donor_name_cache?: string };
  committed_usd: number | null;
  allocated_usd: number | null;
  disbursement_count: number;
  chain: ChainRow[];
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// Disbursement status → design-system pill tone.

export default function TraceabilityPage() {
  const { t } = useTranslation();
  const [grantId, setGrantId] = useState<string | null>(null);
  const [data, setData] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const gid = new URLSearchParams(window.location.search).get('grant');
    setGrantId(gid);
    if (!gid) { setLoading(false); setError(t('proximate.traceability.no_grant')); return; }
    api.get<Trace>(`/api/proximate/grants/${gid}/traceability`)
      .then((r) => setData(r))
      .catch(() => setError(t('proximate.traceability.load_error')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell>
      <PageHeader title={t('proximate.traceability.title')}
        subtitle={t('proximate.traceability.subtitle')} />
      <PageMain>
        <Link href="/proximate/donor" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> {t('common.back')}
        </Link>

        {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && (
          <div className="space-y-4">
            {/* Grant header */}
            <div className="prox-panel" style={{ padding: '16px 18px' }}>
              <p style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-.01em' }}>{data.grant.title}</p>
              {data.grant.donor_name_cache && (
                <p className="text-sm" style={{ color: 'var(--prox-muted)' }}>{data.grant.donor_name_cache}</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                <div className="prox-stat">
                  <div className="lab">{t('proximate.grants.committed')}</div>
                  <div className="val prox-num">{money(data.committed_usd)}</div>
                </div>
                <div className="prox-stat">
                  <div className="lab">{t('proximate.grants.allocated_to_rounds')}</div>
                  <div className="val prox-num">{money(data.allocated_usd)}</div>
                </div>
                <div className="prox-stat">
                  <div className="lab">{t('proximate.cycle.tab_disbursements')}</div>
                  <div className="val prox-num">{data.disbursement_count}</div>
                </div>
              </div>
            </div>

            {data.chain.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t('proximate.traceability.no_rounds')}
              </p>
            )}

            {/* Per-round → disbursements chain */}
            {data.chain.map((row) => (
              <div key={row.round.id} className="prox-panel" style={{ padding: '16px 18px' }}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4" style={{ color: 'var(--prox-muted)' }} />
                    <Link href={`/proximate/rounds/${row.round.id}`} className="hover:underline" style={{ fontFamily: 'var(--font-prox-display), "Bricolage Grotesque", sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--prox-ink)' }}>
                      {row.round.title}
                    </Link>
                    {row.round.status && (
                      <span className={`prox-pill ${proxPillForStatus(row.round.status)}`}>{labelForProximateStatus(row.round.status, t)}</span>
                    )}
                  </div>
                  <p className="text-sm">
                    <span style={{ color: 'var(--prox-muted)' }}>{t('proximate.traceability.allocation')}: </span>
                    <span className="prox-mono" style={{ fontWeight: 700 }}>{money(row.round.allocation_usd)}</span>
                  </p>
                </div>

                {row.disbursements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('proximate.traceability.no_disbursements')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground text-left border-b">
                          <th className="py-1.5 pe-3 font-medium">{t('proximate.traceability.col_partner')}</th>
                          <th className="py-1.5 pe-3 font-medium">{t('proximate.traceability.col_amount')}</th>
                          <th className="py-1.5 pe-3 font-medium">{t('common.status')}</th>
                          <th className="py-1.5 pe-3 font-medium">{t('proximate.traceability.col_report')}</th>
                          <th className="py-1.5 pe-3 font-medium">{t('proximate.traceability.col_verified')}</th>
                          <th className="py-1.5 font-medium">{t('proximate.traceability.col_audit')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.disbursements.map((d) => (
                          <tr key={d.id} className="border-b last:border-0">
                            <td className="py-2 pe-3">
                              <Link href={`/proximate/disbursements/${d.id}`} className="hover:underline">
                                {d.partner_name}
                              </Link>
                            </td>
                            <td className="py-2 pe-3 prox-mono">{money(d.amount_usd)}</td>
                            <td className="py-2 pe-3">
                              <span className={`prox-pill ${proxPillForStatus(d.status)}`}>
                                {labelForProximateStatus(d.status, t)}
                              </span>
                            </td>
                            <td className="py-2 pe-3">
                              {d.report_submitted
                                ? <FileText className="w-4 h-4" style={{ color: 'var(--prox-good)' }} />
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="py-2 pe-3">
                              {d.verifier_verdict === 'confirmed'
                                ? <ShieldCheck className="w-4 h-4" style={{ color: 'var(--prox-good)' }} />
                                : <span className="text-muted-foreground text-xs">{d.verifier_verdict || '—'}</span>}
                            </td>
                            <td className="py-2">
                              {d.audit_anchor ? (
                                <span className="prox-mono text-xs" style={{ color: 'var(--prox-muted)' }} title={d.audit_anchor.payload_hash}>
                                  #{d.audit_anchor.seq} · {d.audit_anchor.payload_hash?.slice(0, 10)}…
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              {t('proximate.traceability.audit_note')}
            </p>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
