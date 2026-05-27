'use client';

/**
 * /admin/crisis-monitoring — Phase 35 (May 2026).
 *
 * Crisis Monitoring Report admin list. Shows the network's weekly reports
 * (most-recent first), with flagged-row counts + publication status.
 * Click a report to drill into its rows.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useCrisisReports } from '@/lib/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNetworkStore } from '@/stores/network-store';
import {
  AlertOctagon, Inbox, Filter, ChevronRight, Flag, ShieldCheck,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_COLOUR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-[hsl(var(--kuja-sun))]/15 text-[hsl(var(--kuja-sun))]',
  published: 'bg-[hsl(var(--kuja-grow))]/15 text-[hsl(var(--kuja-grow))]',
  archived: 'bg-muted text-muted-foreground',
};

export default function CrisisMonitoringListPage() {
  const viewer = useAuthStore((s) => s.user);
  const network = useNetworkStore((s) => s.network);
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useCrisisReports(statusFilter || undefined);

  if (viewer && viewer.role !== 'admin') {
    return (
      <div className="p-6 text-sm">
        <p className="text-destructive">
          Only platform admins can view Crisis Monitoring reports in this phase.
        </p>
      </div>
    );
  }

  const reports = data?.reports ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="kuja-display text-3xl flex items-center gap-2">
            <AlertOctagon className="w-7 h-7 text-[hsl(var(--kuja-clay))]" />
            {network?.name ?? 'Network'} — Crisis Monitoring
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {reports.length} report{reports.length === 1 ? '' : 's'} · published reports
            are the evidence anchor for emergency declarations
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

      {isLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="kuja-shimmer h-20 rounded" />)}
        </div>
      )}

      {!isLoading && reports.length === 0 && (
        <div className="border border-border rounded-lg bg-card p-10 text-center text-sm text-muted-foreground">
          <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No reports in this state. The weekly cron drafts a fresh report every
          Sunday; secretariat publishes after review.
        </div>
      )}

      <div className="space-y-2">
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/admin/crisis-monitoring/${r.id}`}
            className="block border border-border rounded-lg bg-card p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="font-semibold text-base">
                    Week of {new Date(r.period_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(r.period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLOUR[r.status] || STATUS_COLOUR.draft}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  {r.generated_by === 'cron' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      auto-drafted
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                  <span>{r.row_count} {r.row_count === 1 ? 'row' : 'rows'}</span>
                  {r.flagged_row_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-clay))]">
                      <Flag className="w-3 h-3" /> {r.flagged_row_count} flagged for OB
                    </span>
                  )}
                  {r.cron_anchor_audit_id && (
                    <span className="inline-flex items-center gap-1 text-[hsl(var(--kuja-grow))]">
                      <ShieldCheck className="w-3 h-3" /> audit #{r.cron_anchor_audit_id}
                    </span>
                  )}
                  {r.published_at && (
                    <span>published {new Date(r.published_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
