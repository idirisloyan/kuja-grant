'use client';

import { useState, useMemo } from 'react';
import { useGrants, useReports } from '@/lib/hooks/use-api';
import { StatCard } from '@/components/shared/stat-card';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck, AlertTriangle, Clock, BarChart3, ChevronDown, ChevronRight,
  FileText, TrendingUp,
} from 'lucide-react';
import type { Grant, Report } from '@/lib/types';

// ---------------------------------------------------------------------------
// Risk indicator helper
// ---------------------------------------------------------------------------

function getRiskLevel(score: number | null, status: string, dueDate: string | null): 'green' | 'amber' | 'red' {
  const isOverdue = dueDate ? new Date(dueDate) < new Date() : false;
  if (status === 'revision_requested' || isOverdue) return 'red';
  if (score !== null && score < 60) return 'red';
  if (score !== null && score < 80) return 'amber';
  if (status === 'draft' || status === 'submitted') return 'amber';
  return 'green';
}

function RiskDot({ level }: { level: 'green' | 'amber' | 'red' }) {
  const colors = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-rose-500',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[level]}`} />;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Grant Accordion Component
// ---------------------------------------------------------------------------

function GrantAccordion({ grant, reports }: { grant: Grant; reports: Report[] }) {
  const [expanded, setExpanded] = useState(false);

  // Group reports by org
  const orgMap = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of reports) {
      const key = r.org_name || `Org #${r.submitted_by_org_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [reports]);

  // Calculate grant-level compliance
  const scores = reports
    .map((r) => {
      const analysis = r.ai_analysis as Record<string, unknown> | null;
      return analysis && typeof analysis === 'object' && 'compliance_score' in analysis
        ? Number(analysis.compliance_score)
        : null;
    })
    .filter((s): s is number => s !== null);

  const avgCompliance = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const overdueCount = reports.filter((r) => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'accepted').length;

  return (
    <Card>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{grant.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {orgMap.size} grantee{orgMap.size !== 1 ? 's' : ''} | {reports.length} deliverable{reports.length !== 1 ? 's' : ''}
              {overdueCount > 0 && (
                <span className="text-rose-600 ml-2">| {overdueCount} overdue</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ScoreRing score={avgCompliance} size={48} strokeWidth={4} label="Compl." />
          <StatusBadge status={grant.status} />
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-4">
          {Array.from(orgMap.entries()).map(([orgName, orgReports]) => (
            <div key={orgName} className="mb-4 last:mb-0">
              <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-brand-500" />
                {orgName}
              </h4>
              <div className="ml-5 space-y-1.5">
                {orgReports.map((report) => {
                  const analysis = report.ai_analysis as Record<string, unknown> | null;
                  const score = analysis && typeof analysis === 'object' && 'compliance_score' in analysis
                    ? Number(analysis.compliance_score)
                    : null;
                  const risk = getRiskLevel(score, report.status, report.due_date);
                  return (
                    <div
                      key={report.id}
                      className="flex items-center justify-between py-2 px-3 rounded-md bg-slate-50 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <RiskDot level={risk} />
                        <span className="text-slate-900 truncate">{report.title}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{report.report_type}</Badge>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {score !== null && (
                          <span className={`text-xs font-medium ${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {score}%
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          Due: {formatDate(report.due_date)}
                        </span>
                        <StatusBadge status={report.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {orgMap.size === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No reports submitted for this grant yet.</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CompliancePage() {
  const { data: grantsData, isLoading: grantsLoading } = useGrants();
  const { data: reportsData, isLoading: reportsLoading } = useReports();

  const isLoading = grantsLoading || reportsLoading;
  const grants = grantsData?.grants ?? [];
  const reports = reportsData?.reports ?? [];

  // Group reports by grant
  const reportsByGrant = useMemo(() => {
    const map = new Map<number, Report[]>();
    for (const r of reports) {
      if (!map.has(r.grant_id)) map.set(r.grant_id, []);
      map.get(r.grant_id)!.push(r);
    }
    return map;
  }, [reports]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const allScores = reports
      .map((r) => {
        const analysis = r.ai_analysis as Record<string, unknown> | null;
        return analysis && typeof analysis === 'object' && 'compliance_score' in analysis
          ? Number(analysis.compliance_score)
          : null;
      })
      .filter((s): s is number => s !== null);

    const avgCompliance = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;

    const overdueItems = reports.filter(
      (r) => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'accepted',
    ).length;

    const atRiskCount = reports.filter((r) => {
      const analysis = r.ai_analysis as Record<string, unknown> | null;
      const score = analysis && typeof analysis === 'object' && 'compliance_score' in analysis
        ? Number(analysis.compliance_score)
        : null;
      return getRiskLevel(score, r.status, r.due_date) === 'red';
    }).length;

    return {
      totalGrants: grants.length,
      avgCompliance,
      overdueItems,
      atRiskCount,
    };
  }, [grants, reports]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track grantee compliance across all your grants
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ShieldCheck}
          label="Total Grants"
          value={summaryStats.totalGrants}
          color="brand"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Compliance"
          value={`${summaryStats.avgCompliance}%`}
          color="emerald"
        />
        <StatCard
          icon={Clock}
          label="Overdue Items"
          value={summaryStats.overdueItems}
          color="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label="At Risk"
          value={summaryStats.atRiskCount}
          color="rose"
        />
      </div>

      {/* Grant Accordions */}
      <div className="space-y-3">
        {grants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No grants found</p>
              <p className="text-sm text-slate-400 mt-1">Create a grant to start tracking compliance.</p>
            </CardContent>
          </Card>
        ) : (
          grants.map((grant) => (
            <GrantAccordion
              key={grant.id}
              grant={grant}
              reports={reportsByGrant.get(grant.id) ?? []}
            />
          ))
        )}
      </div>
    </div>
  );
}
