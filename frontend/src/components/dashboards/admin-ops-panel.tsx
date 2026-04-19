'use client';

/**
 * Admin Ops Panel — anomaly verdict + conversion funnel + activity line
 * + live AI health panel driven by /api/ai/health.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts';
import { GitMerge, Activity, HeartPulse } from 'lucide-react';

import { VerdictCard, type VerdictAction } from './verdict-card';
import { ChartCard } from './chart-card';
import { fetchSuggestions, fetchAiHealth, type AiHealth, type Suggestion } from '@/lib/copilot-api';
import { api } from '@/lib/api';

const CLAY = 'hsl(19, 82%, 41%)';
const CLAY_LIGHT = 'hsl(24, 88%, 64%)';
const SAVANNA = 'hsl(100, 22%, 33%)';
const GROW = 'hsl(142, 68%, 29%)';

interface AdminStatsResp {
  stats?: {
    conversion_funnel?: { opportunities: number; applications: number; reviewed: number; awarded: number };
    activity_14d?: Array<{ label: string; count: number }>;
  };
}

export function AdminOpsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSugg, setLoadingSugg] = useState(true);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStatsResp['stats'] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestions({ role: 'admin', scope: { kind: 'global' } }).then((res) => {
      if (cancelled) return;
      if (res.ok) setSuggestions(res.data.suggestions ?? []);
      setLoadingSugg(false);
    });
    fetchAiHealth().then((res) => {
      if (cancelled) return;
      if (res.ok) setAiHealth(res.data);
    });
    api.get<AdminStatsResp>('/dashboard/stats').then((d) => {
      if (!cancelled) setAdminStats(d.stats ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Real funnel from /api/dashboard/stats. Zeros if endpoint hasn't
  // loaded yet — charts still render cleanly.
  const funnelData = useMemo(() => {
    const f = adminStats?.conversion_funnel;
    return [
      { stage: 'Opps',     count: f?.opportunities ?? 0, fill: CLAY_LIGHT },
      { stage: 'Apps',     count: f?.applications  ?? 0, fill: CLAY },
      { stage: 'Reviewed', count: f?.reviewed      ?? 0, fill: SAVANNA },
      { stage: 'Awarded',  count: f?.awarded       ?? 0, fill: GROW },
    ];
  }, [adminStats]);

  // Real 14-day activity series (daily submission counts) from the
  // admin stats endpoint.
  const activityData = useMemo(() => {
    if (adminStats?.activity_14d?.length) return adminStats.activity_14d;
    return last14Days().map((d) => ({ ...d, count: 0 }));
  }, [adminStats]);

  const actions: VerdictAction[] = (suggestions ?? []).slice(0, 3).map((s) => ({
    label: s.title,
    severity: s.severity ?? 'info',
    onClick: () => window.dispatchEvent(new CustomEvent('kuja:open-copilot')),
  }));

  const tone = actions.some((a) => a.severity === 'critical') ? 'danger'
    : actions.some((a) => a.severity === 'major') ? 'warn'
    : 'default';

  return (
    <div className="space-y-4">
      <VerdictCard
        tone={tone}
        eyebrow="OPERATIONS"
        headline={actions.length > 0 ? 'AI anomaly scan found items that need attention.' : 'System running clean.'}
        aiBadge="AI anomaly scan"
        actions={actions}
        loading={loadingSugg}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Conversion funnel"
          subtitle="Org-wide opportunities → awards"
          icon={GitMerge}
          caption={{
            chartType: 'conversion-funnel',
            data: funnelData,
            context: 'Org-wide grant conversion pipeline',
          }}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={funnelData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Activity (14d)"
          subtitle="Daily submissions"
          icon={Activity}
          caption={{
            chartType: 'line',
            data: activityData,
            context: 'Daily submission volume, last 14 days',
          }}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={activityData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="count" stroke={CLAY} strokeWidth={2.5} dot={{ r: 3, fill: 'white', stroke: CLAY, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="kuja-chart-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
            AI health
          </div>
          {!aiHealth ? (
            <div className="mt-3 kuja-shimmer h-24 rounded-md" />
          ) : (
            <>
              <div className="mt-3 kuja-numeric text-4xl">
                {aiHealth.total_calls}
                <span className="ml-2 text-sm font-sans font-normal text-muted-foreground">calls · 24h</span>
              </div>
              <div className={`mt-1 text-sm font-medium ${
                aiHealth.success_rate_pct && aiHealth.success_rate_pct >= 95 ? 'text-[hsl(var(--kuja-grow))]'
                : aiHealth.success_rate_pct && aiHealth.success_rate_pct >= 85 ? 'text-[hsl(var(--kuja-sun))]'
                : 'text-[hsl(var(--kuja-flag))]'
              }`}>
                {aiHealth.success_rate_pct ?? '—'}% success
              </div>
              <div className="mt-3 space-y-1">
                {Object.entries(aiHealth.by_endpoint ?? {}).slice(0, 6).map(([ep, v]) => (
                  <div key={ep} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-muted-foreground">{ep}</span>
                    <span className="text-foreground">{v.success}/{v.total}</span>
                  </div>
                ))}
                {Object.keys(aiHealth.by_endpoint ?? {}).length === 0 && (
                  <div className="text-xs text-muted-foreground">No calls yet in this window.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function last14Days() {
  const out: Array<{ label: string; count: number }> = [];
  const d = new Date();
  const demo = [2, 1, 0, 3, 2, 4, 5, 3, 6, 4, 5, 7, 2, 3];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(d);
    dt.setDate(d.getDate() - i);
    out.push({
      label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: demo[13 - i],
    });
  }
  return out;
}
