'use client';

import { useState, useMemo } from 'react';
import { useReports, useUpcomingReports } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText, Upload, ChevronDown, ChevronRight, Calendar,
  AlertTriangle, CheckCircle, Clock, Inbox, Loader2,
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

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function isDueSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff > 0 && diff < 14 * 24 * 60 * 60 * 1000;
}

type TabId = 'by-grant' | 'calendar';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { data: reportData, isLoading: reportsLoading, mutate: mutateReports } = useReports();
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingReports();
  const [activeTab, setActiveTab] = useState<TabId>('by-grant');

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

  // Compute overall compliance
  const overallCompliance = useMemo(() => {
    const scored = reports.filter((r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined);
    if (scored.length === 0) return 0;
    const total = scored.reduce((sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0), 0);
    return Math.round(total / scored.length);
  }, [reports]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Compliance</h1>
          <p className="text-sm text-slate-500 mt-1">Track reporting requirements and compliance</p>
        </div>
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1">
              <AlertTriangle className="w-3 h-3" /> {overdueCount} overdue
            </Badge>
          )}
          <ScoreRing score={overallCompliance} size={48} strokeWidth={4} />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{reports.length}</p>
              <p className="text-sm text-slate-500">Total Reports</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {reports.filter((r) => r.status === 'accepted').length}
              </p>
              <p className="text-sm text-slate-500">Accepted</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${overdueCount > 0 ? 'bg-rose-100' : 'bg-amber-100'} flex items-center justify-center`}>
              <Clock className={`w-5 h-5 ${overdueCount > 0 ? 'text-rose-600' : 'text-amber-600'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{overdueCount}</p>
              <p className="text-sm text-slate-500">Overdue</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 -mb-px">
          <button
            onClick={() => setActiveTab('by-grant')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'by-grant'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FileText className="w-4 h-4" /> By Grant
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'calendar'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Calendar className="w-4 h-4" /> Calendar
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'by-grant' && (
        <ByGrantTab groups={reportsByGrant} mutateReports={mutateReports} />
      )}
      {activeTab === 'calendar' && <CalendarTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// By Grant Tab
// ---------------------------------------------------------------------------

function ByGrantTab({
  groups,
  mutateReports,
}: {
  groups: { grantId: number; grantTitle: string; reports: Report[] }[];
  mutateReports: () => void;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No reports yet</p>
          <p className="text-sm text-slate-400 mt-1">Reports will appear here once you have awarded grants</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <GrantReportGroup key={group.grantId} group={group} mutateReports={mutateReports} />
      ))}
    </div>
  );
}

function GrantReportGroup({
  group,
  mutateReports,
}: {
  group: { grantId: number; grantTitle: string; reports: Report[] };
  mutateReports: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // Compute compliance score for this grant
  const scored = group.reports.filter(
    (r) => r.ai_analysis && (r.ai_analysis as Record<string, unknown>).score !== undefined,
  );
  const grantCompliance = scored.length > 0
    ? Math.round(
        scored.reduce((sum, r) => sum + (Number((r.ai_analysis as Record<string, unknown>).score) || 0), 0) /
          scored.length,
      )
    : 0;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            )}
            <div>
              <CardTitle className="text-base">{group.grantTitle}</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {group.reports.length} deliverable{group.reports.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {grantCompliance > 0 && (
              <ScoreRing score={grantCompliance} size={40} strokeWidth={3} />
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            {group.reports.map((report) => (
              <ReportItem key={report.id} report={report} mutateReports={mutateReports} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ReportItem({
  report,
  mutateReports,
}: {
  report: Report;
  mutateReports: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const overdue = report.status === 'draft' && isOverdue(report.due_date);
  const dueSoon = report.status === 'draft' && isDueSoon(report.due_date);

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
    <div className={`flex items-center gap-4 p-3 rounded-lg border ${
      overdue ? 'border-rose-200 bg-rose-50/50' : 'border-slate-100 bg-slate-50/50'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-900 truncate">{report.title}</p>
          <StatusBadge status={report.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
          <span>{report.report_type}</span>
          <span>{report.reporting_period}</span>
          {report.due_date && (
            <span className={`flex items-center gap-0.5 ${overdue ? 'text-rose-600 font-medium' : dueSoon ? 'text-amber-600' : ''}`}>
              <Calendar className="w-3 h-3" />
              Due: {formatDate(report.due_date)}
              {overdue && ' (Overdue)'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {aiScore !== null && (
          <ScoreRing score={Math.round(aiScore)} size={36} strokeWidth={3} />
        )}

        {report.status === 'draft' && (
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              {uploading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Upload
            </span>
            <Input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar Tab (Placeholder)
// ---------------------------------------------------------------------------

function CalendarTab() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <Calendar className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700">Calendar View</h3>
        <p className="text-sm text-slate-500 mt-1">Coming soon</p>
        <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
          A calendar view of all your reporting deadlines will be available in an upcoming release.
        </p>
      </CardContent>
    </Card>
  );
}
