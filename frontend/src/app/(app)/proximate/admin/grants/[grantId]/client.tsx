'use client';

/**
 * Grant detail — Phase 721.
 *
 * Terms, allocations, reports history, next-report tile.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, FileText, Calendar, DollarSign, AlertCircle, CheckCircle2, MapPin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useProximatePersona } from '@/lib/hooks/use-proximate-persona';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface GrantResp {
  success: boolean;
  grant: {
    id: number;
    title: string;
    donor_name: string | null;
    donor_grant_ref: string | null;
    amount_committed_usd: number | null;
    amount_received_usd: number;
    amount_allocated_usd: number;
    amount_remaining_usd: number;
    currency: string;
    start_date: string | null;
    end_date: string | null;
    reporting_cadence: string;
    reporting_next_due_at: string | null;
    restrictions: {
      geographies?: string[];
      sectors?: string[];
      purpose?: string;
    };
    has_signed_pdf: boolean;
    status: string;
    extracted?: Record<string, unknown>;
  };
  allocations: {
    id: number;
    round_id: number;
    grant_id: number;
    amount_usd: number;
    notes: string | null;
    round_title: string;
    round_status: string | null;
  }[];
  reports: {
    id: number;
    report_type: string;
    period_start: string | null;
    period_end: string | null;
    due_date: string | null;
    status: string;
    compliance_score: unknown[];
    submitted_at: string | null;
    donor_ack_at: string | null;
  }[];
}

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

const reportStatusStyles: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  drafting: 'bg-amber-100 text-amber-800 border-amber-300',
  submitted: 'bg-sky-100 text-sky-800 border-sky-300',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  revision_requested: 'bg-rose-100 text-rose-800 border-rose-300',
};

export function ProximateGrantDetailClient() {
  // Phase 725 — useParams() returns the pre-generated static stub ('0')
  // under output:export, so any real grantId in the URL was being
  // shadowed and the client fetched /grants/0. Read directly from
  // window.location.pathname instead — same pattern as the working
  // /proximate/rounds/[roundId] detail page.
  const [grantId, setGrantId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const m = window.location.pathname.match(/\/grants\/(\d+)/);
    return m ? m[1] : '';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.location.pathname.match(/\/grants\/(\d+)/);
    if (m && m[1] !== '0' && m[1] !== grantId) setGrantId(m[1]);
  }, [grantId]);

  const [data, setData] = useState<GrantResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { persona } = useProximatePersona();
  const isOb = persona === 'ob' || persona === 'admin';

  useEffect(() => {
    if (!grantId || grantId === '0') return;
    let cancelled = false;
    setLoading(true);
    api.get<GrantResp>(`/api/proximate/grants/${grantId}`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setError('Failed to load grant.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [grantId]);

  if (loading) {
    return (
      <PageShell>
        <PageMain>
          <p className="text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline me-2" />
            Loading grant…
          </p>
        </PageMain>
      </PageShell>
    );
  }
  if (error || !data) {
    return (
      <PageShell>
        <PageMain>
          <p className="text-sm text-destructive">{error || 'Not found'}</p>
        </PageMain>
      </PageShell>
    );
  }

  const g = data.grant;
  const pctAllocated = g.amount_committed_usd
    ? Math.min(100, (g.amount_allocated_usd / g.amount_committed_usd) * 100)
    : 0;

  const overdue = data.reports.filter(
    (r) => r.status === 'pending' && r.due_date && new Date(r.due_date) < new Date()
  );
  const upcoming = data.reports.filter(
    (r) => r.status === 'pending' && r.due_date && new Date(r.due_date) >= new Date()
  );
  const submitted = data.reports.filter(
    (r) => r.status !== 'pending'
  );

  return (
    <PageShell>
      <PageHeader
        title={g.title}
        subtitle={`${g.donor_name || 'Donor TBD'}${g.donor_grant_ref ? ` · Ref ${g.donor_grant_ref}` : ''}`}
      />
      <PageMain>
        <div className="space-y-4">
          {/* Financial snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Committed
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_committed_usd)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Received to date
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_received_usd)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Allocated
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_allocated_usd)}</p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${pctAllocated}%` }}
                />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Uncommitted
              </p>
              <p className="text-2xl font-semibold">{fmtUsd(g.amount_remaining_usd)}</p>
            </Card>
          </div>

          {/* Terms */}
          <Card className="p-4">
            <p className="text-sm font-medium mb-3">Grant terms</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Period</p>
                <p className="mt-1">
                  {g.start_date || '?'} → {g.end_date || '?'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  Reporting cadence
                </p>
                <p className="mt-1 font-mono">{g.reporting_cadence}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  Signed PDF
                </p>
                <p className="mt-1">
                  {g.has_signed_pdf ? (
                    <span className="text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> On file
                    </span>
                  ) : (
                    <span className="text-amber-700 inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Not uploaded
                    </span>
                  )}
                </p>
              </div>
            </div>
            {(g.restrictions?.geographies?.length
              || g.restrictions?.sectors?.length
              || g.restrictions?.purpose) && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <p className="text-xs font-medium">Donor restrictions</p>
                {g.restrictions?.geographies?.length ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] uppercase text-muted-foreground">
                      Geography:
                    </span>
                    {g.restrictions.geographies.map((geo) => (
                      <Badge key={geo} variant="outline" className="text-[10px]">
                        {geo}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {g.restrictions?.sectors?.length ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase text-muted-foreground">
                      Sectors:
                    </span>
                    {g.restrictions.sectors.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {g.restrictions?.purpose && (
                  <p className="text-xs text-muted-foreground italic mt-1">
                    &quot;{g.restrictions.purpose}&quot;
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Reporting calendar */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">Reporting calendar</p>
            </div>
            {overdue.length > 0 && (
              <div className="mb-3 p-3 rounded-md border border-rose-300 bg-rose-50">
                <p className="text-xs font-medium text-rose-800 mb-1">
                  {overdue.length} report{overdue.length === 1 ? '' : 's'} overdue
                </p>
                <ul className="text-xs space-y-1">
                  {overdue.map((r) => (
                    <li key={r.id}>
                      {r.report_type} · due {r.due_date}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase">
                  Upcoming
                </p>
                <ul className="text-xs space-y-1.5">
                  {upcoming.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 border-b border-border/60 pb-1.5 last:border-b-0"
                    >
                      <span className="flex-1">
                        {r.report_type} · due {r.due_date}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${reportStatusStyles[r.status] || ''}`}
                      >
                        {r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {submitted.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase">
                  Submitted
                </p>
                <ul className="text-xs space-y-1.5">
                  {submitted.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 border-b border-border/60 pb-1.5 last:border-b-0"
                    >
                      <span className="flex-1">
                        {r.report_type} · {r.period_start} – {r.period_end}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${reportStatusStyles[r.status] || ''}`}
                      >
                        {r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.reports.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                No reports scheduled yet. Reports get auto-generated per the grant&apos;s cadence.
              </p>
            )}
          </Card>

          {/* Round allocations */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">
                Round allocations ({data.allocations.length})
              </p>
            </div>
            {data.allocations.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                No rounds have drawn from this grant yet.
                {isOb && ' Rounds can be allocated from the round detail page or here.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.allocations.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 border-b border-border/60 pb-1.5 last:border-b-0"
                  >
                    <Link
                      href={`/proximate/rounds/${a.round_id}`}
                      className="flex-1 min-w-0 text-sm hover:underline"
                    >
                      <span className="font-medium truncate block">
                        {a.round_title}
                      </span>
                      {a.round_status && (
                        <span className="text-[10px] text-muted-foreground">
                          {a.round_status}
                        </span>
                      )}
                    </Link>
                    <p className="text-sm font-mono">{fmtUsd(a.amount_usd)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* AI-extraction inspection panel (OB only) */}
          {isOb && g.extracted && Object.keys(g.extracted).length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">AI-extracted terms</p>
                <p className="text-[10px] text-muted-foreground">
                  (raw first pass — canonical values above have been reviewed)
                </p>
              </div>
              <pre className="text-[10px] font-mono bg-muted/40 p-3 rounded-md overflow-x-auto max-h-64">
                {JSON.stringify(g.extracted, null, 2)}
              </pre>
            </Card>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
