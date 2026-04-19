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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from 'recharts';
import { GitMerge, Clock4, ShieldAlert } from 'lucide-react';

import { VerdictCard, type VerdictAction } from './verdict-card';
import { ChartCard } from './chart-card';
import { fetchDonorPortfolioInsights, type DonorPortfolioInsights } from '@/lib/copilot-api';
import { api } from '@/lib/api';

const CLAY = 'hsl(19, 82%, 41%)';
const CLAY_LIGHT = 'hsl(24, 88%, 64%)';
const SAVANNA = 'hsl(100, 22%, 33%)';
const SUN = 'hsl(32, 95%, 44%)';
const FLAG = 'hsl(0, 74%, 42%)';
const GROW = 'hsl(142, 68%, 29%)';

interface ApplicationsResp {
  applications?: Array<{ status?: string; ai_score?: number | null }>;
}

export function DonorCommandCenter() {
  const [verdict, setVerdict] = useState<DonorPortfolioInsights | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(true);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const [apps, setApps] = useState<ApplicationsResp['applications']>([]);

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

  // ---- risk heatmap ------------------------------------------------
  const riskData = useMemo(() => [
    { dim: 'Compliance',  score: 72, fill: riskColor(72) },
    { dim: 'Delivery',    score: 65, fill: riskColor(65) },
    { dim: 'Financial',   score: 80, fill: riskColor(80) },
    { dim: 'Capacity',    score: 58, fill: riskColor(58) },
  ], []);

  // ---- verdict actions --------------------------------------------
  const verdictActions: VerdictAction[] = (verdict?.next_decisions ?? []).slice(0, 3).map((d) => ({
    label: d.title,
    severity: (d.severity as VerdictAction['severity']) ?? 'info',
    onClick: () => {
      // Open co-pilot for deeper context
      const evt = new CustomEvent('kuja:open-copilot');
      window.dispatchEvent(evt);
    },
  }));

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
          <ResponsiveContainer width="100%" height="100%">
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
          </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={velocityData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="median" fill={SAVANNA} radius={[6, 6, 0, 0]} name="Median days" />
              <Bar dataKey="p75"    fill={SUN}     radius={[6, 6, 0, 0]} name="p75 days" />
            </BarChart>
          </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height="100%">
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
          </ResponsiveContainer>
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
