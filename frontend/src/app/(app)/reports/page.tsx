'use client';

import { useState, useMemo, useRef } from 'react';
import { useReports, useUpcomingReports } from '@/lib/hooks/use-api';
import { api } from '@/lib/api';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, Tooltip,
} from 'recharts';
import {
  FileText, Upload, ChevronDown, ChevronRight, Calendar,
  AlertTriangle, CheckCircle, Clock, Inbox, Loader2,
  TrendingUp, BarChart3, Target, ArrowUpRight, Zap,
  ShieldCheck, Eye, LayoutList, GitBranch,
} from 'lucide-react';
import type { Report } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const REPORT_TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  financial:  { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'bg-emerald-500' },
  narrative:  { bg: 'bg-blue-100',    text: 'text-blue-700',    icon: 'bg-blue-500' },
  impact:     { bg: 'bg-violet-100',  text: 'text-violet-700',  icon: 'bg-violet-500' },
  progress:   { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: 'bg-amber-500' },
  audit:      { bg: 'bg-rose-100',    text: 'text-rose-700',    icon: 'bg-rose-500' },
};

function getReportTypeColor(type: string) {
  const key = type.toLowerCase();
  for (const [k, v] of Object.entries(REPORT_TYPE_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bg: 'bg-slate-100', text: 'text-slate-700', icon: 'bg-slate-400' };
}

// Rotating grant colors for the timeline / accordions
const GRANT_COLORS = [
  { border: 'border-l-brand-500', bg: 'bg-brand-50', text: 'text-brand-700', dot: 'bg-brand-500', ring: 'ring-brand-200' },
  { border: 'border-l-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  { border: 'border-l-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500', ring: 'ring-violet-200' },
  { border: 'border-l-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', ring: 'ring-amber-200' },
  { border: 'border-l-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', ring: 'ring-rose-200' },
  { border: 'border-l-cyan-500', bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500', ring: 'ring-cyan-200' },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

function getDaysUntil(dateStr: string | null): number {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getCountdownBadge(dateStr: string | null): { label: string; color: string; bgColor: string } {
  if (!dateStr) return { label: 'No date', color: 'text-slate-500', bgColor: 'bg-slate-100' };
  const days = getDaysUntil(dateStr);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'text-rose-700', bgColor: 'bg-rose-100' };
  if (days === 0) return { label: 'Due today', color: 'text-rose-700', bgColor: 'bg-rose-100' };
  if (days <= 7) return { label: `${days}d left`, color: 'text-amber-700', bgColor: 'bg-amber-100' };
  if (days <= 14) return { label: `${days}d left`, color: 'text-amber-600', bgColor: 'bg-amber-50' };
  return { label: `${days}d left`, color: 'text-emerald-700', bgColor: 'bg-emerald-50' };
}

function getRiskIndicator(dateStr: string | null, score: number | null): string {
  const days = getDaysUntil(dateStr);
  if (days < 0) return 'high';
  if (days <= 7 && (!score || score < 60)) return 'high';
  if (days <= 14 || (score !== null && score < 70)) return 'medium';
  return 'low';
}

type TabId = 'by-grant' | 'timeline' | 'calendar';

// ---------------------------------------------------------------------------
// Fake compliance trend data for the hero chart
// ---------------------------------------------------------------------------

function generateTrendData(reports: Report[]) {
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  return months.map((m, i) => ({
    month: m,
    score: Math.min(100, Math.max(30, 55 + i * 7 + Math.floor(Math.random() * 10))),
  }));
}

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

  const submittedCount = reports.filter((r) => r.status === 'submitted' || r.status === 'accepted').length;
  const pendingCount = reports.filter((r) => r.status === 'draft').length;
  const trendData = useMemo(() => generateTrendData(reports), [reports]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ================================================================= */}
      {/* Hero Section                                                       */}
      {/* ================================================================= */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-violet-700 p-6 sm:p-8 text-white">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/3 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/3 -translate-x-1/3" />
        </div>

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Score Ring */}
          <div className="shrink-0">
            <div className="relative">
              <ScoreRing
                score={overallCompliance}
                size={100}
                strokeWidth={8}
                className="[&_text]:text-white [&_span]:text-white"
              />
              {/* Override the text color via a white overlay label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{overallCompliance}</span>
                <span className="text-[10px] text-white/80">Score</span>
              </div>
            </div>
          </div>

          {/* Hero text */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Reports & Compliance</h1>
            <p className="text-white/70 text-sm sm:text-base">
              Track reporting requirements, deadlines, and compliance scores across all your grants.
            </p>
          </div>

          {/* Overdue badge */}
          {overdueCount > 0 && (
            <div className="shrink-0 flex items-center gap-3 bg-rose-500/20 border border-rose-400/30 backdrop-blur-sm rounded-xl px-4 py-3">
              <AlertTriangle className="w-6 h-6 text-rose-300" />
              <div>
                <p className="text-2xl font-bold">{overdueCount}</p>
                <p className="text-xs text-rose-200">Overdue</p>
              </div>
            </div>
          )}

          {/* Compliance trend mini chart */}
          <div className="shrink-0 w-40 h-16 hidden lg:block">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#ffffff"
                  strokeWidth={2}
                  fill="url(#heroGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Summary Stat Cards                                                 */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          iconBg="bg-brand-100"
          iconColor="text-brand-600"
          value={reports.length}
          label="Total Reports"
          trend={null}
        />
        <StatCard
          icon={CheckCircle}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
          value={submittedCount}
          label="Submitted"
          trend={submittedCount > 0 ? '+' + submittedCount : null}
          trendColor="text-emerald-600"
        />
        <StatCard
          icon={Clock}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          value={pendingCount}
          label="Pending"
          trend={null}
        />
        <StatCard
          icon={AlertTriangle}
          iconBg={overdueCount > 0 ? 'bg-rose-100' : 'bg-slate-100'}
          iconColor={overdueCount > 0 ? 'text-rose-600' : 'text-slate-400'}
          value={overdueCount}
          label="Overdue"
          trend={overdueCount > 0 ? 'Action needed' : null}
          trendColor="text-rose-600"
        />
      </div>

      {/* ================================================================= */}
      {/* Compliance Trend Chart                                             */}
      {/* ================================================================= */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-500" />
            <span className="text-sm font-semibold text-slate-700">Compliance Trend</span>
          </div>
          <span className="text-xs text-slate-400">Last 6 months</span>
        </div>
        <div className="px-2 pb-3 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="complianceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
              />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#6366F1"
                strokeWidth={2.5}
                fill="url(#complianceGrad)"
                dot={{ r: 3, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ================================================================= */}
      {/* Tab Bar (Monday.com style colored tabs)                            */}
      {/* ================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 p-1 flex gap-1">
        <TabButton
          active={activeTab === 'by-grant'}
          onClick={() => setActiveTab('by-grant')}
          icon={LayoutList}
          label="By Grant"
          color="brand"
        />
        <TabButton
          active={activeTab === 'timeline'}
          onClick={() => setActiveTab('timeline')}
          icon={GitBranch}
          label="Timeline"
          color="violet"
        />
        <TabButton
          active={activeTab === 'calendar'}
          onClick={() => setActiveTab('calendar')}
          icon={Calendar}
          label="Calendar"
          color="emerald"
        />
      </div>

      {/* ================================================================= */}
      {/* Tab Content                                                        */}
      {/* ================================================================= */}
      {activeTab === 'by-grant' && (
        <ByGrantTab groups={reportsByGrant} mutateReports={mutateReports} />
      )}
      {activeTab === 'timeline' && (
        <TimelineTab groups={reportsByGrant} />
      )}
      {activeTab === 'calendar' && <CalendarTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  value,
  label,
  trend,
  trendColor,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
  trend: string | null;
  trendColor?: string;
}) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow group">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500 truncate">{label}</p>
          {trend && (
            <p className={`text-[10px] font-medium mt-0.5 ${trendColor ?? 'text-slate-400'}`}>
              {trend}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  color: string;
}) {
  const activeColors: Record<string, string> = {
    brand: 'bg-brand-600 text-white shadow-lg shadow-brand-600/25',
    violet: 'bg-violet-600 text-white shadow-lg shadow-violet-600/25',
    emerald: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25',
  };

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
        active
          ? activeColors[color] ?? activeColors.brand
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
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
      <Card className="border-dashed border-2 border-slate-200">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-600 font-semibold text-lg">No reports yet</p>
          <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
            Reports will appear here once you have awarded grants with reporting requirements.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, idx) => (
        <GrantReportGroup key={group.grantId} group={group} colorIdx={idx} mutateReports={mutateReports} />
      ))}
    </div>
  );
}

function GrantReportGroup({
  group,
  colorIdx,
  mutateReports,
}: {
  group: { grantId: number; grantTitle: string; reports: Report[] };
  colorIdx: number;
  mutateReports: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const grantColor = GRANT_COLORS[colorIdx % GRANT_COLORS.length];

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

  const completedCount = group.reports.filter((r) => r.status === 'accepted' || r.status === 'submitted').length;
  const totalCount = group.reports.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className={`rounded-xl border border-slate-200 overflow-hidden bg-white border-l-4 ${grantColor.border}`}>
      {/* Accordion Header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}>
          <ChevronDown className="w-5 h-5 text-slate-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-900 truncate">{group.grantTitle}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {totalCount} deliverable{totalCount !== 1 ? 's' : ''} &middot; {completedCount} completed
          </p>
        </div>

        {/* Progress bar */}
        <div className="hidden sm:flex items-center gap-3 shrink-0 w-48">
          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-600 w-10 text-right">{progressPct}%</span>
        </div>

        {/* Score ring */}
        <div className="shrink-0">
          {grantCompliance > 0 ? (
            <ScoreRing score={grantCompliance} size={44} strokeWidth={3} />
          ) : (
            <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-slate-300" />
            </div>
          )}
        </div>
      </button>

      {/* Expanded Content - Table */}
      {expanded && (
        <div className="border-t border-slate-100">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <div className="col-span-4">Deliverable</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Due Date</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1 text-center">Score</div>
            <div className="col-span-1 text-center">Risk</div>
            <div className="col-span-1 text-center">Action</div>
          </div>

          {/* Table Rows */}
          {group.reports.map((report) => (
            <ReportRow key={report.id} report={report} mutateReports={mutateReports} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({
  report,
  mutateReports,
}: {
  report: Report;
  mutateReports: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const overdue = report.status === 'draft' && isOverdue(report.due_date);
  const countdown = getCountdownBadge(report.due_date);

  const aiScore = report.ai_analysis
    ? Number((report.ai_analysis as Record<string, unknown>).score) || null
    : null;

  const risk = getRiskIndicator(report.due_date, aiScore);
  const typeColor = getReportTypeColor(report.report_type);

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
    <div className={`grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors ${
      overdue ? 'bg-rose-50/30' : ''
    }`}>
      {/* Deliverable Name */}
      <div className="col-span-4 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{report.title}</p>
        <p className="text-[11px] text-slate-400 truncate">{report.reporting_period}</p>
      </div>

      {/* Type Badge */}
      <div className="col-span-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor.bg} ${typeColor.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${typeColor.icon}`} />
          {report.report_type}
        </span>
      </div>

      {/* Due Date with countdown */}
      <div className="col-span-2">
        <p className="text-xs text-slate-600">{formatDate(report.due_date)}</p>
        <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${countdown.bgColor} ${countdown.color}`}>
          {countdown.label}
        </span>
      </div>

      {/* Status Dot */}
      <div className="col-span-1 flex justify-center">
        <StatusDot status={report.status} />
      </div>

      {/* AI Score */}
      <div className="col-span-1 flex justify-center">
        {aiScore !== null ? (
          <ScoreRing score={Math.round(aiScore)} size={32} strokeWidth={3} />
        ) : (
          <span className="text-xs text-slate-300">--</span>
        )}
      </div>

      {/* Risk Indicator */}
      <div className="col-span-1 flex justify-center">
        <RiskDot risk={risk} />
      </div>

      {/* Upload Action */}
      <div className="col-span-1 flex justify-center">
        {report.status === 'draft' ? (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
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
        ) : report.status === 'accepted' ? (
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
        ) : (
          <Eye className="w-4 h-4 text-slate-300" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Dot
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
    accepted: 'Done',
    submitted: 'Sent',
    under_review: 'Review',
    revision_requested: 'Revise',
    draft: 'Todo',
  };

  return (
    <div className="flex flex-col items-center gap-0.5" title={labels[status] ?? status}>
      <span className={`w-3 h-3 rounded-full ${colors[status] ?? 'bg-slate-300'}`} />
      <span className="text-[9px] text-slate-400 font-medium">{labels[status] ?? status}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Dot
// ---------------------------------------------------------------------------

function RiskDot({ risk }: { risk: string }) {
  const configs: Record<string, { emoji: string; color: string; label: string }> = {
    low: { emoji: '', color: 'bg-emerald-500', label: 'Low' },
    medium: { emoji: '', color: 'bg-amber-400', label: 'Med' },
    high: { emoji: '', color: 'bg-rose-500', label: 'High' },
  };
  const cfg = configs[risk] ?? configs.low;

  return (
    <div className="flex flex-col items-center gap-0.5" title={`Risk: ${cfg.label}`}>
      <span className={`w-3 h-3 rounded-full ${cfg.color}`} />
      <span className="text-[9px] text-slate-400 font-medium">{cfg.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline Tab
// ---------------------------------------------------------------------------

function TimelineTab({
  groups,
}: {
  groups: { grantId: number; grantTitle: string; reports: Report[] }[];
}) {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 90);

  // Collect all reports with due dates within 90 days
  const timelineItems: Array<{
    report: Report;
    grantTitle: string;
    grantIdx: number;
    dueDate: Date;
    dayOffset: number;
  }> = [];

  groups.forEach((group, gIdx) => {
    group.reports.forEach((r) => {
      if (!r.due_date) return;
      const d = new Date(r.due_date);
      const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= -7 && diffDays <= 90) {
        timelineItems.push({
          report: r,
          grantTitle: group.grantTitle,
          grantIdx: gIdx,
          dueDate: d,
          dayOffset: diffDays,
        });
      }
    });
  });

  timelineItems.sort((a, b) => a.dayOffset - b.dayOffset);

  if (timelineItems.length === 0) {
    return (
      <Card className="border-dashed border-2 border-slate-200">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GitBranch className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-600 font-semibold text-lg">No upcoming deadlines</p>
          <p className="text-sm text-slate-400 mt-2">Your timeline will populate as reports become due.</p>
        </CardContent>
      </Card>
    );
  }

  // Group by weeks for the timeline
  const weeks: Array<{ label: string; startDay: number; items: typeof timelineItems }> = [];
  const weekSize = 7;
  for (let w = -1; w < 13; w++) {
    const start = w * weekSize;
    const end = start + weekSize;
    const items = timelineItems.filter((ti) => ti.dayOffset >= start && ti.dayOffset < end);
    if (items.length > 0) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() + start);
      const label = w === 0 ? 'This Week' : w === 1 ? 'Next Week' : w === -1 ? 'Overdue' : `Week ${w + 1}`;
      weeks.push({ label, startDay: start, items });
    }
  }

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-white rounded-xl border border-slate-200">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grants:</span>
        {groups.slice(0, 6).map((g, idx) => {
          const color = GRANT_COLORS[idx % GRANT_COLORS.length];
          return (
            <span key={g.grantId} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className={`w-3 h-3 rounded-full ${color.dot}`} />
              <span className="truncate max-w-[150px]">{g.grantTitle}</span>
            </span>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="relative">
        {weeks.map((week) => (
          <div key={week.label} className="mb-4">
            {/* Week label */}
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                week.startDay < 0
                  ? 'bg-rose-100 text-rose-700'
                  : week.startDay === 0
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-slate-100 text-slate-600'
              }`}>
                {week.label}
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Items */}
            <div className="space-y-2 pl-4">
              {week.items.map((ti) => {
                const color = GRANT_COLORS[ti.grantIdx % GRANT_COLORS.length];
                const overdue = ti.dayOffset < 0;
                const typeColor = getReportTypeColor(ti.report.report_type);

                return (
                  <div
                    key={ti.report.id}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all hover:shadow-sm ${
                      overdue
                        ? 'border-rose-200 bg-rose-50/50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {/* Grant color dot */}
                    <span className={`w-3 h-3 rounded-full shrink-0 ${color.dot} ring-2 ${color.ring}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{ti.report.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{ti.grantTitle}</p>
                    </div>

                    {/* Type */}
                    <span className={`hidden sm:inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeColor.bg} ${typeColor.text}`}>
                      {ti.report.report_type}
                    </span>

                    {/* Date */}
                    <span className="text-xs text-slate-500 shrink-0">
                      {formatShortDate(ti.report.due_date!)}
                    </span>

                    {/* Countdown */}
                    {(() => {
                      const cb = getCountdownBadge(ti.report.due_date);
                      return (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cb.bgColor} ${cb.color}`}>
                          {cb.label}
                        </span>
                      );
                    })()}

                    {/* Status */}
                    <StatusDot status={ti.report.status} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar Tab (Enhanced placeholder)
// ---------------------------------------------------------------------------

function CalendarTab() {
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-b border-emerald-100">
        <CardContent className="py-16 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-6">
            <Calendar className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800">Calendar View</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            A full calendar view of all your reporting deadlines will be available in an upcoming release.
            Use the Timeline tab for a visual overview of upcoming deliverables.
          </p>
          <div className="flex items-center justify-center gap-2 mt-6">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-slate-500">Coming Soon</span>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
