'use client';

import { useState, useMemo, useRef } from 'react';
import { useReports, useUpcomingReports } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ChevronDown, Upload, Loader2,
} from 'lucide-react';
import type { Report } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysUntil(dateStr: string | null): number {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getDeadlineText(dateStr: string | null): { label: string; color: string } {
  if (!dateStr) return { label: '', color: 'text-slate-400' };
  const days = getDaysUntil(dateStr);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'text-red-600' };
  if (days === 0) return { label: 'Due today', color: 'text-red-600' };
  if (days <= 7) return { label: `${days}d left`, color: 'text-red-600' };
  if (days <= 30) return { label: `${days}d left`, color: 'text-amber-600' };
  return { label: `${days}d left`, color: 'text-slate-500' };
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    accepted: 'bg-emerald-500',
    submitted: 'bg-blue-500',
    under_review: 'bg-amber-500',
    revision_requested: 'bg-amber-500',
    draft: 'bg-slate-300',
  };

  const labels: Record<string, string> = {
    accepted: 'Accepted',
    submitted: 'Submitted',
    under_review: 'Review',
    revision_requested: 'Revise',
    draft: 'Draft',
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status] ?? 'bg-slate-300'}`} />
      {labels[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { data: reportData, isLoading: reportsLoading, mutate: mutateReports } = useReports();
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingReports();

  const reports = useMemo(() => reportData?.reports ?? [], [reportData]);
  const overdueCount = upcomingData?.overdue_count ?? 0;
  const isLoading = reportsLoading || upcomingLoading;

  // Group reports by grant
  const reportsByGrant = useMemo(() => {
    const groups: Record<string, { grantId: number; grantTitle: string; reports: Report[] }> = {};
    for (const r of reports) {
      const key = String(r.grant_id);
      if (!groups[key]) {
        groups[key] = {
          grantId: r.grant_id,
          grantTitle: r.grant_title || `Grant #${r.grant_id}`,
          reports: [],
        };
      }
      groups[key].reports.push(r);
    }
    return Object.values(groups);
  }, [reports]);

  // Overall compliance
  const overallCompliance = useMemo(() => {
    const scored = reports.filter(
      (r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined,
    );
    if (scored.length === 0) return 0;
    const total = scored.reduce(
      (sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0),
      0,
    );
    return Math.round(total / scored.length);
  }, [reports]);

  // Timeline items (next 90 days)
  const timelineItems = useMemo(() => {
    const today = new Date();
    const items: Array<{
      report: Report;
      grantTitle: string;
      daysLeft: number;
    }> = [];

    reportsByGrant.forEach((group) => {
      group.reports.forEach((r) => {
        if (!r.due_date) return;
        const days = getDaysUntil(r.due_date);
        if (days >= -7 && days <= 90) {
          items.push({ report: r, grantTitle: group.grantTitle, daysLeft: days });
        }
      });
    });

    items.sort((a, b) => a.daysLeft - b.daysLeft);
    return items;
  }, [reportsByGrant]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const submittedCount = reports.filter((r) => r.status === 'submitted' || r.status === 'accepted').length;
  const pendingCount = reports.filter((r) => r.status === 'draft').length;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports & Compliance</h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-slate-500">
            {overallCompliance > 0
              ? `${overallCompliance}% compliant`
              : `${reports.length} reports total`}
          </p>
          {overdueCount > 0 && (
            <span className="text-sm text-red-600">
              {overdueCount} overdue report{overdueCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-2xl font-semibold text-slate-900">{reports.length}</p>
          <p className="text-sm text-slate-500 mt-1">Total Reports</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-2xl font-semibold text-slate-900">{submittedCount}</p>
          <p className="text-sm text-slate-500 mt-1">Submitted</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-2xl font-semibold text-slate-900">{pendingCount}</p>
          <p className="text-sm text-slate-500 mt-1">Pending</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className={`text-2xl font-semibold ${overdueCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {overdueCount}
          </p>
          <p className="text-sm text-slate-500 mt-1">Overdue</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="by-grant">
        <TabsList className="bg-slate-100 h-9">
          <TabsTrigger value="by-grant" className="text-xs">By Grant</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
        </TabsList>

        {/* By Grant Tab */}
        <TabsContent value="by-grant" className="mt-6">
          {reportsByGrant.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-500">No reports yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Reports will appear once you have awarded grants with reporting requirements.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reportsByGrant.map((group) => (
                <GrantReportGroup
                  key={group.grantId}
                  group={group}
                  mutateReports={mutateReports}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-6">
          {timelineItems.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-500">No upcoming deadlines</p>
            </div>
          ) : (
            <div className="space-y-1">
              {timelineItems.map((item) => {
                const dl = getDeadlineText(item.report.due_date);
                return (
                  <div
                    key={item.report.id}
                    className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-xs text-slate-400 w-20 shrink-0">
                      {formatDate(item.report.due_date)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 truncate">{item.report.title}</p>
                      <p className="text-xs text-slate-400 truncate">{item.grantTitle}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">
                      {item.report.report_type}
                    </span>
                    <StatusDot status={item.report.status} />
                    <span className={`text-xs font-medium shrink-0 ${dl.color}`}>
                      {dl.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grant Report Group (Accordion)
// ---------------------------------------------------------------------------

function GrantReportGroup({
  group,
  mutateReports,
}: {
  group: { grantId: number; grantTitle: string; reports: Report[] };
  mutateReports: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const scored = group.reports.filter(
    (r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined,
  );
  const grantCompliance = scored.length > 0
    ? Math.round(
        scored.reduce(
          (sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0),
          0,
        ) / scored.length,
      )
    : 0;

  const completedCount = group.reports.filter(
    (r) => r.status === 'accepted' || r.status === 'submitted',
  ).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            expanded ? '' : '-rotate-90'
          }`}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">
            {group.grantTitle}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {group.reports.length} deliverable{group.reports.length !== 1 ? 's' : ''}
            {' / '}
            {completedCount} completed
          </p>
        </div>

        {grantCompliance > 0 && (
          <span className="text-xs text-slate-500 shrink-0">
            {grantCompliance}%
          </span>
        )}
      </button>

      {/* Table */}
      {expanded && (
        <div className="border-t border-slate-100">
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2 text-[11px] font-medium text-slate-400 uppercase tracking-wider bg-slate-50">
            <div className="col-span-4">Report</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Due Date</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1 text-center">Score</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {group.reports.map((report) => (
            <ReportRow key={report.id} report={report} mutateReports={mutateReports} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report Row
// ---------------------------------------------------------------------------

function ReportRow({
  report,
  mutateReports,
}: {
  report: Report;
  mutateReports: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dl = getDeadlineText(report.due_date);

  const aiScore = report.ai_analysis
    ? Number((report.ai_analysis as Record<string, unknown>).score) || null
    : null;

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload(`/reports/${report.id}/attachments`, formData);
      mutateReports();
    } catch {
      // Error handling
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
      {/* Title */}
      <div className="col-span-4 min-w-0">
        <p className="text-sm text-slate-900 truncate">{report.title}</p>
        {report.reporting_period && (
          <p className="text-[11px] text-slate-400 truncate">{report.reporting_period}</p>
        )}
      </div>

      {/* Type */}
      <div className="col-span-2">
        <span className="text-xs text-slate-500">{report.report_type}</span>
      </div>

      {/* Due Date */}
      <div className="col-span-2">
        <p className="text-xs text-slate-600">{formatDate(report.due_date)}</p>
        <span className={`text-[11px] ${dl.color}`}>{dl.label}</span>
      </div>

      {/* Status */}
      <div className="col-span-1 flex justify-center">
        <StatusDot status={report.status} />
      </div>

      {/* Score */}
      <div className="col-span-1 flex justify-center">
        {aiScore !== null ? (
          <ScoreRing score={Math.round(aiScore)} size={28} strokeWidth={2.5} />
        ) : (
          <span className="text-xs text-slate-300">--</span>
        )}
      </div>

      {/* Upload */}
      <div className="col-span-2 flex justify-end">
        {report.status === 'draft' ? (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50 flex items-center gap-1"
            >
              {uploading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </>
        ) : (
          <span className="text-xs text-slate-400">
            {report.status === 'accepted' ? 'Accepted' : 'Submitted'}
          </span>
        )}
      </div>
    </div>
  );
}
