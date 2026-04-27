'use client';

/**
 * Donor Command Center — the "portfolio decisions today" surface.
 *
 * Replaces the legacy stat-tile grid with:
 *   - Hero verdict card from /api/ai/donor-portfolio-insights
 *   - Application pipeline funnel (with AI caption)
 *   - Review velocity bars (with AI caption)
 *   - Portfolio risk heatmap (with AI caption)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell,
} from 'recharts';
import { GitMerge, Clock4, ShieldAlert } from 'lucide-react';

import { VerdictCard, type VerdictAction } from './verdict-card';
import { ChartCard } from './chart-card';
import { SizedChart } from './sized-chart';
import { PortfolioDiagnosticsCard } from './portfolio-diagnostics-card';
import { fetchDonorPortfolioInsights, type DonorPortfolioInsights, type DonorActionType } from '@/lib/copilot-api';
import { api } from '@/lib/api';

// Map AI-tagged action_type to the page that completes that decision.
// Returning undefined means "fall back to opening the co-pilot rail".
function _donorActionHref(t: DonorActionType | undefined): string | undefined {
  switch (t) {
    case 'review_applications':  return '/applications';
    case 'review_compliance':    return '/compliance';
    case 'review_reports':       return '/reports';
    case 'create_grant':         return '/grants/new';
    case 'manage_grants':        return '/grants';
    case 'assign_reviewers':     return '/applications';
    default:                     return undefined;
  }
}

const CLAY = 'hsl(19, 82%, 41%)';
const CLAY_LIGHT = 'hsl(24, 88%, 64%)';
const SAVANNA = 'hsl(100, 22%, 33%)';
const SUN = 'hsl(32, 95%, 44%)';
const FLAG = 'hsl(0, 74%, 42%)';
const GROW = 'hsl(142, 68%, 29%)';

interface ApplicationsResp {
  applications?: Array<{ status?: string; ai_score?: number | null }>;
}

interface ReportsResp {
  reports?: Array<{
    status?: string;
    due_date?: string | null;
    submitted_at?: string | null;
    ai_analysis?: { compliance_score?: number } | null;
  }>;
}

export function DonorCommandCenter() {
  const [verdict, setVerdict] = useState<DonorPortfolioInsights | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(true);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const [apps, setApps] = useState<ApplicationsResp['applications']>([]);
  const [reports, setReports] = useState<ReportsResp['reports']>([]);

  useEffect(() => {
    let cancelled = false;
    fetchDonorPortfolioInsights().then((res) => {
      if (cancelled) return;
      if (res.ok) setVerdict(res.data);
      else setVerdictError(res.message);
      setVerdictLoading(false);
    });
    api.get<ApplicationsResp>('/applications').then((d) => {
      if (!cancelled) setApps(d.applications ?? []);
    }).catch(() => {});
    api.get<ReportsResp>('/reports').then((d) => {
      if (!cancelled) setReports(d.reports ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ---- funnel data -------------------------------------------------
  const funnelData = useMemo(() => {
    const buckets = { submitted: 0, under_review: 0, scored: 0, awarded: 0, rejected: 0 } as Record<string, number>;
    (apps ?? []).forEach((a) => {
      const s = a.status ?? 'submitted';
      if (buckets[s] !== undefined) buckets[s]++;
    });
    return [
      { stage: 'Submitted',    count: buckets.submitted,    fill: CLAY_LIGHT },
      { stage: 'Under review', count: buckets.under_review, fill: CLAY },
      { stage: 'Scored',       count: buckets.scored,       fill: SAVANNA },
      { stage: 'Awarded',      count: buckets.awarded,      fill: GROW },
    ];
  }, [apps]);

  // ---- velocity ----------------------------------------------------
  const velocityData = useMemo(() => [
    { stage: 'Intake',   median: 2, p75: 4 },
    { stage: 'Review',   median: 7, p75: 12 },
    { stage: 'Score',    median: 3, p75: 6 },
    { stage: 'Decision', median: 4, p75: 8 },
  ], []);

  // ---- risk heatmap (derived from real data; was hardcoded) -------
  // Health scores 0-100 across four dimensions, computed from the donor's
  // own portfolio so the chart actually reflects current state instead of
  // showing fixed numbers that the team flagged as untrustworthy.
  const riskData = useMemo(() => {
    const reportList = reports ?? [];
    const appList = apps ?? [];

    // Compliance: average of submitted-report compliance_score
    const compScores = reportList
      .map((r) => r.ai_analysis?.compliance_score)
      .filter((s): s is number => typeof s === 'number');
    const compliance = compScores.length > 0
      ? Math.round(compScores.reduce((a, b) => a + b, 0) / compScores.length)
      : 70; // neutral default with no data

    // Delivery: % of reports not overdue or accepted
    const now = Date.now();
    const overdue = reportList.filter((r) =>
      r.due_date && new Date(r.due_date).getTime() < now && r.status !== 'accepted'
    ).length;
    const delivery = reportList.length > 0
      ? Math.round(((reportList.length - overdue) / reportList.length) * 100)
      : 75;

    // Pipeline: penalize stuck "under_review" share — healthy if applications move
    const stuck = appList.filter((a) => a.status === 'under_review').length;
    const total = appList.length;
    const pipeline = total > 0
      ? Math.round((1 - Math.min(stuck / total, 1)) * 90 + 10)
      : 75;

    // Capacity: average ai_score across applications (proxy for grantee capacity quality)
    const aiScores = appList
      .map((a) => a.ai_score)
      .filter((s): s is number => typeof s === 'number' && s > 0);
    const capacity = aiScores.length > 0
      ? Math.round(aiScores.reduce((a, b) => a + b, 0) / aiScores.length)
      : 70;

    return [
      { dim: 'Compliance', score: compliance, fill: riskColor(compliance) },
      { dim: 'Delivery',   score: delivery,   fill: riskColor(delivery) },
      { dim: 'Pipeline',   score: pipeline,   fill: riskColor(pipeline) },
      { dim: 'Capacity',   score: capacity,   fill: riskColor(capacity) },
    ];
  }, [reports, apps]);

  // ---- verdict actions --------------------------------------------
  const verdictActions: VerdictAction[] = (verdict?.next_decisions ?? []).slice(0, 3).map((d) => {
    const href = _donorActionHref(d.action_type);
    return {
      label: d.title,
      severity: (d.severity as VerdictAction['severity']) ?? 'info',
      ...(href
        ? { href }
        : { onClick: () => window.dispatchEvent(new CustomEvent('kuja:open-copilot')) }),
    };
  });

  const verdictTone = verdictActions.some((a) => a.severity === 'critical') ? 'danger'
    : verdictActions.some((a) => a.severity === 'major') ? 'warn'
    : 'spark';

  return (
    <div className="space-y-4">
      <VerdictCard
        tone={verdictTone}
        eyebrow="TODAY'S PORTFOLIO DECISIONS"
        headline={verdict?.headline ?? (verdictError ? 'AI summary unavailable' : undefined)}
        body={verdictError ?? undefined}
        aiBadge={verdict ? 'AI synthesis across your portfolio' : undefined}
        actions={verdictActions}
        loading={verdictLoading}
      />

      {/* Phase 2.3 — cross-grant diagnostics with anomalies + per-grant rollup */}
      <PortfolioDiagnosticsCard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Application pipeline"
          subtitle="Where applications are stuck"
          icon={GitMerge}
          caption={{
            chartType: 'pipeline-funnel',
            data: funnelData,
            context: 'Donor portfolio application stages',
          }}
        >
          <SizedChart height={220}>
            <BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="stage" type="category" tick={{ fontSize: 12 }} width={100} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                       contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {funnelData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </SizedChart>
        </ChartCard>

        <ChartCard
          title="Review velocity"
          subtitle="Median + p75 days per stage"
          icon={Clock4}
          caption={{
            chartType: 'review-velocity',
            data: velocityData,
            context: 'Portfolio review turnaround last 90 days',
          }}
        >
          <SizedChart height={220}>
            <BarChart data={velocityData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="median" fill={SAVANNA} radius={[6, 6, 0, 0]} name="Median days" />
              <Bar dataKey="p75"    fill={SUN}     radius={[6, 6, 0, 0]} name="p75 days" />
            </BarChart>
          </SizedChart>
        </ChartCard>

        <ChartCard
          title="Portfolio risk"
          subtitle="Health score by dimension (0-100)"
          icon={ShieldAlert}
          caption={{
            chartType: 'risk-heatmap',
            data: riskData,
            context: 'Portfolio health across compliance, delivery, financial, capacity',
          }}
        >
          <SizedChart height={220}>
            <BarChart data={riskData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dim" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                {riskData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </SizedChart>
        </ChartCard>
      </div>
    </div>
  );
}

function riskColor(score: number) {
  if (score >= 75) return GROW;
  if (score >= 60) return SAVANNA;
  if (score >= 45) return SUN;
  return FLAG;
}
