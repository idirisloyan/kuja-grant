'use client';

/**
 * /admin/reports — Phase 69 (June 2026).
 *
 * NEAR-operator-facing reports list. The existing /reports route is the
 * NGO/donor workflow surface — coauthor panels, prechecks, bundle UI —
 * which makes it heavy for an operator who just wants to see "what
 * reports are due across the network, who's late, what's stuck in
 * review."
 *
 * This route mirrors /admin/declarations: a calm list with a status
 * filter, a window scope chip, and one row per report linking to the
 * existing /reports/<id> detail page.
 *
 * Accepts ?window_id=N for deep-links from /admin/windows/[id].
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useReports } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import { FileText, Inbox, Filter, ChevronRight, Wallet, X } from 'lucide-react';
import { describeReportStatus, TONE_PILL_CLASS } from '@/lib/status-copy';
import type { Report } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: '',           label: 'All' },
  { value: 'pending',    label: 'Not yet started' },
  { value: 'draft',      label: 'Draft' },
  { value: 'submitted',  label: 'Submitted — awaiting review' },
  { value: 'in_review',  label: 'In review' },
  { value: 'approved',   label: 'Accepted' },
  { value: 'rejected',   label: 'Rejected — revise' },
  { value: 'overdue',    label: 'Overdue' },
];

// Days until the deadline. Reused from /reports semantics so the
// urgency banding is consistent across surfaces.
function getDaysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  const t = new Date(dateStr).getTime();
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

function deadlineCopy(dateStr: string | null | undefined): {
  label: string;
  cls: string;
} {
  if (!dateStr) return { label: '', cls: 'text-muted-foreground' };
  const days = getDaysUntil(dateStr);
  if (days < 0) {
    return { label: `${Math.abs(days)}d overdue`, cls: 'text-destructive font-semibold' };
  }
  if (days === 0) return { label: 'due today', cls: 'text-destructive font-semibold' };
  if (days <= 7)  return { label: `${days}d left`, cls: 'text-destructive' };
  if (days <= 30) return { label: `${days}d left`, cls: 'text-[hsl(var(--kuja-sun))]' };
  return { label: `${days}d left`, cls: 'text-muted-foreground' };
}

export default function AdminReportsListPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const [statusFilter, setStatusFilter] = useState('');

  const searchParams = useSearchParams();
  const windowIdParam = searchParams.get('window_id');
  const windowId = windowIdParam ? Number(windowIdParam) : null;

  const queryParams: Record<string, string> = {};
  if (statusFilter) queryParams.status = statusFilter;
  if (windowId) queryParams.window_id = String(windowId);
  const { data, isLoading } = useReports(queryParams);

  const rows = useMemo<Report[]>(() => (data?.reports ?? []) as Report[], [data]);

  // Order: overdue first, then due soon, then everything else by created.
  const ordered = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = getDaysUntil(a.due_date);
      const db = getDaysUntil(b.due_date);
      // Overdue (negative days) bubble up.
      if (da < 0 && db >= 0) return -1;
      if (db < 0 && da >= 0) return 1;
      return da - db;
    });
  }, [rows]);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          Only network operators can view the cross-network reports list.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="kuja-display text-3xl flex items-center gap-2">
            <FileText className="w-7 h-7 text-[hsl(var(--kuja-clay))]" />
            {network?.name ?? 'Network'} — reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ordered.length} report{ordered.length === 1 ? '' : 's'}
            {windowId && <> · filtered to window #{windowId}</>}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 rounded-md border border-border bg-background text-xs"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {windowId && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[hsl(var(--kuja-clay))]/15 text-[hsl(var(--kuja-clay))] font-semibold">
            <Wallet className="w-3 h-3" />
            Window #{windowId}
            <Link
              href="/admin/reports"
              className="inline-flex items-center hover:bg-[hsl(var(--kuja-clay))]/20 rounded-full p-0.5 ml-0.5"
              title="Clear window filter"
            >
              <X className="w-3 h-3" />
            </Link>
          </span>
          <Link
            href={`/admin/windows/${windowId}`}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Open window operations
          </Link>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded" />)}
        </div>
      )}

      {!isLoading && ordered.length === 0 && (
        <div className="border border-border rounded-lg bg-card p-10 text-center space-y-2">
          <Inbox className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            No reports{statusFilter ? ` in '${statusFilter.replace(/_/g, ' ')}' state` : ''}
            {windowId ? <> under window #{windowId}</> : null}.
          </p>
          {windowId && (
            <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
              Reports are generated when grants under this window submit their
              periodic reporting. If none appear yet, the grantees may not have
              reached their first reporting period.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {ordered.map((r) => {
          const sc = describeReportStatus(r.status);
          const dl = deadlineCopy(r.due_date);
          return (
            <Link
              key={r.id}
              href={`/reports/${r.id}`}
              className="block border border-border rounded-lg bg-card p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-semibold text-base truncate">
                      {r.grant_title || r.title || `Report #${r.id}`}
                    </h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TONE_PILL_CLASS[sc.tone]}`}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    {r.org_name && <span>{r.org_name}</span>}
                    {r.reporting_period && <span>· {r.reporting_period}</span>}
                    {r.report_type && <span>· {r.report_type.replace(/_/g, ' ')}</span>}
                    {dl.label && <span className={dl.cls}>· {dl.label}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
