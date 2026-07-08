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
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

const STATUS_TONE: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  flagged: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  reported: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  pending_report: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  pending_cosign: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

export default function TraceabilityPage() {
  const [grantId, setGrantId] = useState<string | null>(null);
  const [data, setData] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const gid = new URLSearchParams(window.location.search).get('grant');
    setGrantId(gid);
    if (!gid) { setLoading(false); setError('No grant specified.'); return; }
    api.get<Trace>(`/api/proximate/grants/${gid}/traceability`)
      .then((r) => setData(r))
      .catch(() => setError('Could not load the money trail for this grant.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell>
      <PageHeader title="Money trail"
        subtitle="Follow every dollar from the grant commitment to the partner report, outcome, and its tamper-evident audit anchor." />
      <PageMain>
        <Link href="/proximate/donor" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && (
          <div className="space-y-4">
            {/* Grant header */}
            <Card className="p-4">
              <p className="text-lg font-semibold">{data.grant.title}</p>
              {data.grant.donor_name_cache && (
                <p className="text-sm text-muted-foreground">{data.grant.donor_name_cache}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Committed</p>
                  <p className="font-semibold">{money(data.committed_usd)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Allocated to rounds</p>
                  <p className="font-semibold">{money(data.allocated_usd)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Disbursements</p>
                  <p className="font-semibold">{data.disbursement_count}</p>
                </div>
              </div>
            </Card>

            {data.chain.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No rounds have been funded from this grant yet.
              </p>
            )}

            {/* Per-round → disbursements chain */}
            {data.chain.map((row) => (
              <Card key={row.round.id} className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                    <Link href={`/proximate/rounds/${row.round.id}`} className="font-medium hover:underline">
                      {row.round.title}
                    </Link>
                    {row.round.status && (
                      <Badge variant="outline" className="text-xs">{row.round.status}</Badge>
                    )}
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Allocation: </span>
                    <span className="font-semibold">{money(row.round.allocation_usd)}</span>
                  </p>
                </div>

                {row.disbursements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No disbursements yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground text-left border-b">
                          <th className="py-1.5 pe-3 font-medium">Partner</th>
                          <th className="py-1.5 pe-3 font-medium">Amount</th>
                          <th className="py-1.5 pe-3 font-medium">Status</th>
                          <th className="py-1.5 pe-3 font-medium">Report</th>
                          <th className="py-1.5 pe-3 font-medium">Verified</th>
                          <th className="py-1.5 font-medium">Audit anchor</th>
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
                            <td className="py-2 pe-3 tabular-nums">{money(d.amount_usd)}</td>
                            <td className="py-2 pe-3">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${STATUS_TONE[d.status] || 'bg-muted text-muted-foreground'}`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="py-2 pe-3">
                              {d.report_submitted
                                ? <FileText className="w-4 h-4 text-emerald-600" />
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="py-2 pe-3">
                              {d.verifier_verdict === 'confirmed'
                                ? <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                : <span className="text-muted-foreground text-xs">{d.verifier_verdict || '—'}</span>}
                            </td>
                            <td className="py-2">
                              {d.audit_anchor ? (
                                <span className="font-mono text-xs text-muted-foreground" title={d.audit_anchor.payload_hash}>
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
              </Card>
            ))}

            <p className="text-xs text-muted-foreground">
              Audit anchors reference the tenant&apos;s hash-chained audit log — any change to a prior entry breaks every anchor after it.
            </p>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
