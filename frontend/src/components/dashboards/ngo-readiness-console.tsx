'use client';

/**
 * NGO Readiness Console — coached next actions + readiness gauge.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis, Cell,
} from 'recharts';
import { Send, Gauge } from 'lucide-react';

import { VerdictCard, type VerdictAction } from './verdict-card';
import { ChartCard } from './chart-card';
import { fetchNgoReadiness, type NgoReadiness } from '@/lib/copilot-api';
import { api } from '@/lib/api';

const CLAY = 'hsl(19, 82%, 41%)';
const CLAY_LIGHT = 'hsl(24, 88%, 64%)';
const SAVANNA = 'hsl(100, 22%, 33%)';
const SUN = 'hsl(32, 95%, 44%)';
const FLAG = 'hsl(0, 74%, 42%)';
const GROW = 'hsl(142, 68%, 29%)';

interface ApplicationsResp {
  applications?: Array<{ status?: string }>;
}

export function NgoReadinessConsole() {
  const [readiness, setReadiness] = useState<NgoReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<ApplicationsResp['applications']>([]);

  useEffect(() => {
    let cancelled = false;
    fetchNgoReadiness().then((res) => {
      if (cancelled) return;
      if (res.ok) setReadiness(res.data);
      else setError(res.message);
      setLoading(false);
    });
    api.get<ApplicationsResp>('/applications').then((d) => {
      if (!cancelled) setApps(d.applications ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const pipelineData = useMemo(() => {
    const b = { draft: 0, submitted: 0, under_review: 0, scored: 0, awarded: 0, rejected: 0 } as Record<string, number>;
    (apps ?? []).forEach((a) => {
      const s = a.status ?? 'draft';
      if (b[s] !== undefined) b[s]++;
    });
    return [
      { stage: 'Draft',        count: b.draft,         fill: 'hsl(var(--muted-foreground))' },
      { stage: 'Submitted',    count: b.submitted,     fill: CLAY_LIGHT },
      { stage: 'Under review', count: b.under_review,  fill: CLAY },
      { stage: 'Scored',       count: b.scored,        fill: SAVANNA },
      { stage: 'Awarded',      count: b.awarded,       fill: GROW },
      { stage: 'Rejected',     count: b.rejected,      fill: FLAG },
    ];
  }, [apps]);

  const score = readiness?.readiness_score ?? 0;
  const gaugeData = [{ name: 'readiness', value: score }];
  const gaugeColor = score >= 70 ? GROW : score >= 50 ? SUN : FLAG;
  const verdictTone = score >= 70 ? 'success' : score >= 50 ? 'warn' : 'danger';

  const actions: VerdictAction[] = (readiness?.next_actions ?? []).slice(0, 3).map((a) => ({
    label: a.title,
    severity: (a.severity as VerdictAction['severity']) ?? 'info',
    onClick: () => window.dispatchEvent(new CustomEvent('kuja:open-copilot')),
  }));

  return (
    <div className="space-y-4">
      <VerdictCard
        tone={verdictTone}
        eyebrow="YOUR READINESS — NEXT ACTIONS"
        headline={readiness?.headline ?? (error ? 'Readiness coaching unavailable' : undefined)}
        body={readiness ? `${readiness.readiness_score}/100 holistic readiness` : (error ?? undefined)}
        aiBadge={readiness ? 'AI coach' : undefined}
        actions={actions}
        loading={loading}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Readiness score"
          subtitle="Your competitive strength"
          icon={Gauge}
          caption={readiness ? {
            chartType: 'readiness-ring',
            data: { score, subscores: readiness.subscores },
            context: 'Holistic NGO readiness',
          } : undefined}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <RadialBarChart
              innerRadius="70%"
              outerRadius="100%"
              data={gaugeData}
              startAngle={225}
              endAngle={-45}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={10} fill={gaugeColor} background={{ fill: 'hsl(var(--muted))' }} />
              <text
                x="50%" y="45%" textAnchor="middle" dominantBaseline="middle"
                className="kuja-numeric"
                style={{ fontSize: 44, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
              >{score}</text>
              <text
                x="50%" y="62%" textAnchor="middle"
                style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              >of 100</text>
            </RadialBarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard
            title="Your application pipeline"
            subtitle="Submissions across stages"
            icon={Send}
            caption={{
              chartType: 'bar',
              data: pipelineData,
              context: 'NGO application pipeline across stages',
            }}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={pipelineData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipelineData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
