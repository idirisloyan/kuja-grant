'use client';

import { useState, useMemo } from 'react';
import { useGrants, useReports } from '@/lib/hooks/use-api';
import { useTranslation } from '@/lib/hooks/use-translation';
import { ScoreRing } from '@/components/shared/score-ring';
import { StatusBadge } from '@/components/shared/status-badge';
import { InfoTip } from '@/components/shared/info-tip';
import {
  ShieldCheck, AlertTriangle, Clock, BarChart3, FileText, TrendingUp, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Grant, Report } from '@/lib/types';

function getRiskLevel(score: number | null, status: string, dueDate?: string | null): 'green' | 'amber' | 'red' {
  const isOverdue = dueDate ? new Date(dueDate) < new Date() : false;
  if (status === 'revision_requested' || isOverdue) return 'red';
  if (score !== null && score < 60) return 'red';
  if (score !== null && score < 80) return 'amber';
  if (status === 'draft' || status === 'submitted') return 'amber';
  return 'green';
}

function RiskDot({ level }: { level: 'green' | 'amber' | 'red' }) {
  const cls = level === 'green' ? 'bg-[hsl(var(--kuja-grow))]'
    : level === 'amber' ? 'bg-[hsl(var(--kuja-sun))]'
    : 'bg-[hsl(var(--kuja-flag))]';
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full flex-shrink-0', cls)} />;
}

function GrantAccordion({ grant, reports }: { grant: Grant; reports: Report[] }) {
  const { t, formatDate } = useTranslation();
  const [open, setOpen] = useState(false);

  const orgMap = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of reports) {
      const key = r.org_name || `Org #${r.submitted_by_org_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [reports]);

  const scores = reports.map((r) => {
    const a = r.ai_analysis as Record<string, unknown> | null;
    return a && typeof a === 'object' && 'compliance_score' in a ? Number(a.compliance_score) : null;
  }).filter((s): s is number => s !== null);
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const overdue = reports.filter((r) => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'accepted').length;

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="font-semibold text-foreground truncate">{grant.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {orgMap.size} {t('compliance.grantees') || 'grantees'} · {reports.length} {t('report.deliverables') || 'deliverables'}
            {overdue > 0 && (
              <span className="text-[hsl(var(--kuja-flag))] ml-1">
                · {overdue} {t('compliance.overdue') || 'overdue'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ScoreRing score={avg} size={48} strokeWidth={4} label={t('compliance.score_label_short')} />
          <StatusBadge status={grant.status} kind="grant" />
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border">
          {orgMap.size === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('compliance.no_reports_for_grant') || 'No reports for this grant yet.'}
            </p>
          ) : (
            Array.from(orgMap.entries()).map(([orgName, orgReports]) => (
              <div key={orgName} className="mt-4 first:mt-4">
                <div className="flex items-center gap-2 mb-1.5 bg-muted/20 px-3 py-2 rounded-md">
                  <FileText className="h-3.5 w-3.5 text-[hsl(var(--kuja-clay))]" />
                  <span className="text-sm font-medium">{orgName}</span>
                </div>
                <div className="ml-5 space-y-1.5">
                  {orgReports.map((r) => {
                    const a = r.ai_analysis as Record<string, unknown> | null;
                    const score = a && typeof a === 'object' && 'compliance_score' in a ? Number(a.compliance_score) : null;
                    const risk = getRiskLevel(score, r.status, r.due_date);
                    const isOverdue = r.due_date && new Date(r.due_date) < new Date() && r.status !== 'accepted';
                    const daysOverdue = isOverdue && r.due_date
                      ? Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000) : 0;
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          'flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm',
                          isOverdue
                            ? 'bg-[hsl(0_85%_97%)] border-l-4 border-[hsl(var(--kuja-flag))]'
                            : 'bg-muted/30',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isOverdue ? <span className="kuja-pulse"><RiskDot level="red" /></span> : <RiskDot level={risk} />}
                          <span className="truncate">{r.title}</span>
                          <span className="text-[10px] uppercase tracking-wider rounded-full border border-border text-muted-foreground px-2 py-0.5 flex-shrink-0">
                            {r.report_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                          {isOverdue && daysOverdue > 0 && (
                            <span className="rounded-full bg-[hsl(var(--kuja-flag))] text-white px-2 py-0.5 text-[10px] font-semibold">
                              {t('deadline.overdue', { n: daysOverdue })}
                            </span>
                          )}
                          {score !== null && (
                            <span className={cn(
                              'font-medium',
                              score >= 80 ? 'text-[hsl(var(--kuja-grow))]' : score >= 60 ? 'text-[hsl(var(--kuja-sun))]' : 'text-[hsl(var(--kuja-flag))]',
                            )}>
                              {score}%
                            </span>
                          )}
                          <span className={cn(isOverdue ? 'text-[hsl(var(--kuja-flag))]' : 'text-muted-foreground')}>
                            {t('compliance.due_prefix')}: {formatDate(r.due_date)}
                          </span>
                          <StatusBadge status={r.status} kind="report" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function CompliancePage() {
  const { t } = useTranslation();
  const { data: grantsData, isLoading: grantsLoading } = useGrants();
  const { data: reportsData, isLoading: reportsLoading } = useReports();

  const isLoading = grantsLoading || reportsLoading;
  // Compliance is a posture-tracking surface for ACTIVE grants. Drafts have no
  // applications, no awards, and no compliance signal — they were polluting
  // the donor compliance view with empty test rows. Exclude them here.
  const grants = (grantsData?.grants ?? []).filter((g) => g.status !== 'draft');
  const reports = reportsData?.reports ?? [];

  const reportsByGrant = useMemo(() => {
    const map = new Map<number, Report[]>();
    for (const r of reports) {
      if (!map.has(r.grant_id)) map.set(r.grant_id, []);
      map.get(r.grant_id)!.push(r);
    }
    return map;
  }, [reports]);

  const summary = useMemo(() => {
    const all = reports.map((r) => {
      const a = r.ai_analysis as Record<string, unknown> | null;
      return a && typeof a === 'object' && 'compliance_score' in a ? Number(a.compliance_score) : null;
    }).filter((s): s is number => s !== null);
    const avg = all.length > 0 ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
    const overdueItems = reports.filter((r) => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'accepted').length;
    const atRisk = reports.filter((r) => {
      const a = r.ai_analysis as Record<string, unknown> | null;
      const s = a && typeof a === 'object' && 'compliance_score' in a ? Number(a.compliance_score) : null;
      return getRiskLevel(s, r.status, r.due_date) === 'red';
    }).length;
    return { totalGrants: grants.length, avgCompliance: avg, overdueItems, atRisk };
  }, [grants, reports]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="kuja-shimmer h-10 w-64 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => <div key={i} className="kuja-shimmer h-24 rounded-xl" />)}
        </div>
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="kuja-shimmer h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="kuja-display text-3xl inline-flex items-center gap-2">
          {t('compliance.dashboard_title') || 'Compliance'}
          <InfoTip>{t('glossary.compliance')}</InfoTip>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('compliance.dashboard_subtitle') || 'Track grant compliance, deliverables, and risk.'}
        </p>
      </div>

      {(summary.overdueItems > 0 || summary.atRisk > 0) && (
        <div className="kuja-verdict kuja-verdict-danger flex items-center gap-3 flex-wrap">
          <AlertTriangle className="h-5 w-5 text-[hsl(var(--kuja-flag))] flex-shrink-0" />
          <div className="flex gap-6 flex-wrap text-sm">
            {summary.overdueItems > 0 && (
              <div className="flex items-baseline gap-1">
                <span className="kuja-numeric text-xl font-semibold text-[hsl(var(--kuja-flag))]">{summary.overdueItems}</span>
                <span className="text-[hsl(var(--kuja-flag))]">{t('compliance.overdue') || 'overdue'}</span>
              </div>
            )}
            {summary.atRisk > 0 && (
              <div className="flex items-baseline gap-1">
                <span className="kuja-numeric text-xl font-semibold text-[hsl(var(--kuja-sun))]">{summary.atRisk}</span>
                <span className="text-[hsl(var(--kuja-sun))]">{t('compliance.at_risk_text')}</span>
              </div>
            )}
            <div className="flex items-baseline gap-1">
              <span className="kuja-numeric text-xl font-semibold">{reports.filter((r) => r.status === 'accepted').length}</span>
              <span className="text-muted-foreground">{t('compliance.on_track') || 'on track'}</span>
            </div>
          </div>
        </div>
      )}

      {(summary.overdueItems > 0 || summary.atRisk > 0) && (
        <div className="rounded-xl border border-[hsl(var(--kuja-spark-soft))] bg-[hsl(var(--kuja-spark-soft))]/40 p-3 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-[hsl(var(--kuja-spark))] flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs leading-relaxed">
            <span className="font-semibold text-[hsl(var(--kuja-spark))]">{t('compliance.recommended_action_title')}</span>{' '}
            {t('compliance.recommended_action_body', { overdue: summary.overdueItems, atRisk: summary.atRisk })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryStat icon={AlertTriangle} label={t('compliance.at_risk') || 'At risk'} value={summary.atRisk} tone="danger" />
        <SummaryStat icon={Clock} label={t('compliance.overdue_items') || 'Overdue items'} value={summary.overdueItems} tone="warn" />
        <SummaryStat icon={ShieldCheck} label={t('compliance.total_grants') || 'Total grants'} value={summary.totalGrants} />
        <SummaryStat icon={TrendingUp} label={t('compliance.avg_compliance') || 'Avg compliance'} value={`${summary.avgCompliance}%`} tone="success" />
      </div>

      <div className="space-y-2">
        {grants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background px-6 py-14 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="kuja-display text-xl">{t('compliance.no_grants') || 'No grants yet'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('compliance.no_grants_hint') || 'Grants will appear here as they are funded.'}
            </p>
          </div>
        ) : (
          grants.map((g) => (
            <GrantAccordion key={g.id} grant={g} reports={reportsByGrant.get(g.id) ?? []} />
          ))
        )}
      </div>
    </div>
  );
}

function SummaryStat({
  icon: Icon, label, value, tone,
}: { icon: typeof ShieldCheck; label: string; value: number | string; tone?: 'success' | 'warn' | 'danger' }) {
  const cls = tone === 'success' ? 'text-[hsl(var(--kuja-grow))]'
    : tone === 'warn' ? 'text-[hsl(var(--kuja-sun))]'
    : tone === 'danger' ? 'text-[hsl(var(--kuja-flag))]'
    : 'text-[hsl(var(--kuja-clay-dark))]';
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <Icon className={cn('h-5 w-5 mb-2', cls)} />
      <div className={cn('kuja-numeric text-2xl font-semibold', cls)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
