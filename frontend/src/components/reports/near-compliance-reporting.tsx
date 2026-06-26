'use client';

/**
 * NEAR Compliance & Reporting — simplified, grouped-by-grant view.
 *
 * Renders for NGOs (and admins) in the NEAR tenant. Replaces the big
 * Kuja reports page (1100+ lines, marketplace-flavoured) with a tight
 * grant-grouped surface. Each grant gets its own card listing reports
 * (submitted + pending) with deadline + status. Action buttons link
 * out to the existing report detail page where the work happens.
 */

import Link from 'next/link';
import { useReports, useGrants } from '@/lib/hooks/use-api';
import type { Report, Grant } from '@/lib/types';
import {
  FileText, Calendar, CheckCircle2, AlertCircle, Clock, Coins,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from '@/lib/hooks/use-translation';

type T = (key: string, params?: Record<string, string | number>) => string;
type FmtDate = (d: Date, opts?: Intl.DateTimeFormatOptions) => string;

function deadlineMeta(dateStr: string | null | undefined, t: T, formatDate: FmtDate) {
  if (!dateStr) return { label: '—', tone: 'muted' as const };
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: t('near_reports.deadline.overdue_n_days', { n: Math.abs(days) }), tone: 'bad' as const };
  if (days === 0) return { label: t('near_reports.deadline.due_today'), tone: 'bad' as const };
  if (days <= 7) return { label: t('near_reports.deadline.n_days_left', { n: days }), tone: 'warn' as const };
  if (days <= 30) return { label: t('near_reports.deadline.n_days_left', { n: days }), tone: 'muted' as const };
  return { label: t('near_reports.deadline.due_date', { date: formatDate(d, { month: 'short', day: 'numeric' }) }), tone: 'muted' as const };
}

function statusMeta(status: string | null | undefined) {
  if (!status) return { tone: 'muted' as const, icon: <Clock className="w-3 h-3" /> };
  if (status === 'submitted' || status === 'accepted') return { tone: 'good' as const, icon: <CheckCircle2 className="w-3 h-3" /> };
  if (status === 'overdue' || status === 'rejected') return { tone: 'bad' as const, icon: <AlertCircle className="w-3 h-3" /> };
  if (status === 'in_review' || status === 'pending') return { tone: 'warn' as const, icon: <Clock className="w-3 h-3" /> };
  return { tone: 'muted' as const, icon: <Clock className="w-3 h-3" /> };
}

export function NearComplianceReporting() {
  const { t, formatDate } = useTranslation();
  const { data: reportsData, isLoading: reportsLoading } = useReports();
  const { data: grantsData, isLoading: grantsLoading } = useGrants();

  const reports = reportsData?.reports ?? [];
  const grants = grantsData?.grants ?? [];

  // Group reports by grant
  const byGrant: Record<number, Report[]> = {};
  for (const r of reports) {
    const gid = (r.grant_id as number | undefined) ?? 0;
    if (!byGrant[gid]) byGrant[gid] = [];
    byGrant[gid].push(r);
  }

  // Build a unified list: every grant gets a card, even those with no reports yet
  const grantsWithReports = grants.map((g) => ({
    grant: g,
    reports: byGrant[g.id] || [],
  }));

  // Add an "Other" bucket if there are reports not tied to any grant in the list
  const knownGrantIds = new Set(grants.map((g) => g.id));
  const orphanReports = reports.filter((r) => {
    const gid = (r.grant_id as number | undefined);
    return !gid || !knownGrantIds.has(gid);
  });

  if (reportsLoading || grantsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-32 rounded" />)}
      </div>
    );
  }

  if (grantsWithReports.length === 0 && orphanReports.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card p-10 text-center">
        <Coins className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">
          {t('near_reports.no_grants_yet')}
        </p>
      </div>
    );
  }

  // Aggregate counts for the header
  const totalDue = reports.filter((r) => r.status !== 'submitted' && r.status !== 'accepted').length;
  const totalOverdue = reports.filter((r) => {
    if (r.status === 'submitted' || r.status === 'accepted') return false;
    return deadlineMeta(r.due_date, t, formatDate).tone === 'bad';
  }).length;

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Active grants" value={grants.length} tone="muted" />
        <SummaryStat label="Reports total" value={reports.length} tone="muted" />
        <SummaryStat label="Items due" value={totalDue} tone="warn" />
        <SummaryStat label="Overdue" value={totalOverdue} tone={totalOverdue > 0 ? 'bad' : 'muted'} />
      </div>

      {/* Per-grant cards */}
      {grantsWithReports.map(({ grant, reports }) => (
        <GrantCard key={grant.id} grant={grant} reports={reports} />
      ))}

      {/* Orphan reports (rare — shows when a report references a deleted grant) */}
      {orphanReports.length > 0 && (
        <div className="border border-border rounded-lg bg-card p-5 space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground">
            {t('near_reports.other_reports')}
          </h2>
          <ul className="space-y-2">
            {orphanReports.map((r) => <ReportRow key={r.id} r={r} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'bad' | 'muted' }) {
  const cls =
    tone === 'bad' ? 'text-destructive'
    : tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : tone === 'good' ? 'text-[hsl(var(--kuja-grow))]'
    : 'text-foreground';
  return (
    <div className="border border-border rounded-lg bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function GrantCard({ grant, reports }: { grant: Grant; reports: Report[] }) {
  const submittedCount = reports.filter((r) => r.status === 'submitted' || r.status === 'accepted').length;
  const dueCount = reports.length - submittedCount;
  const grantAmount = (grant as { total_funding?: number | string }).total_funding;

  return (
    <section className="border border-border rounded-lg bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="font-semibold text-base">{grant.title}</h2>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground capitalize">
              {grant.status?.replace('_', ' ') || 'draft'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
            {grantAmount && (
              <span className="inline-flex items-center gap-1">
                <Coins className="w-3 h-3" /> {Number(grantAmount).toLocaleString()} {grant.currency || 'USD'}
              </span>
            )}
            <span>{reports.length} report{reports.length === 1 ? '' : 's'}</span>
            {submittedCount > 0 && (
              <span className="text-[hsl(var(--kuja-grow))]">{submittedCount} submitted</span>
            )}
            {dueCount > 0 && (
              <span className="text-[hsl(var(--kuja-sun))]">{dueCount} due</span>
            )}
          </div>
        </div>
        <Link
          href={`/grants/${grant.id}`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Open grant <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {reports.length > 0 ? (
        <ul className="space-y-1.5">
          {reports.map((r) => <ReportRow key={r.id} r={r} />)}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic border-t border-border pt-3">
          No reports for this grant yet.
        </p>
      )}
    </section>
  );
}

function ReportRow({ r }: { r: Report }) {
  const { t, formatDate } = useTranslation();
  const deadline = deadlineMeta(r.due_date, t, formatDate);
  const status = statusMeta(r.status);
  const statusTone =
    status.tone === 'good' ? 'text-[hsl(var(--kuja-grow))]'
    : status.tone === 'bad' ? 'text-destructive'
    : status.tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : 'text-muted-foreground';
  const deadlineTone =
    deadline.tone === 'bad' ? 'text-destructive font-semibold'
    : deadline.tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : 'text-muted-foreground';

  return (
    <li>
      <Link
        href={`/reports/${r.id}`}
        className="flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded-md hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">
            {(r as { title?: string }).title || (r as { type?: string }).type || `Report #${r.id}`}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className={`inline-flex items-center gap-1 ${deadlineTone}`}>
            <Calendar className="w-3 h-3" />
            {deadline.label}
          </span>
          <span className={`inline-flex items-center gap-1 capitalize ${statusTone}`}>
            {status.icon}
            {r.status?.replace('_', ' ') || 'draft'}
          </span>
        </div>
      </Link>
    </li>
  );
}
