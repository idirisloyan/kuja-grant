'use client';

/**
 * Reviewer Queue — AI-prioritized queue + SLA breakdown + compare entry.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AlarmClock, GitCompare } from 'lucide-react';

import { VerdictCard, type VerdictAction } from './verdict-card';
import { ChartCard } from './chart-card';
import { fetchSuggestions, type Suggestion } from '@/lib/copilot-api';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const GROW = 'hsl(142, 68%, 29%)';
const SAVANNA = 'hsl(100, 22%, 33%)';
const SUN = 'hsl(32, 95%, 44%)';
const FLAG = 'hsl(0, 74%, 42%)';

interface DashboardStatsResp {
  stats?: {
    sla_breakdown?: Array<{ age: string; count: number }>;
    assigned_reviews?: number;
    in_progress_reviews?: number;
    total_reviews?: number;
  };
}

export function ReviewerQueue() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStatsResp['stats'] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestions({ role: 'reviewer', scope: { kind: 'global' } }).then((res) => {
      if (cancelled) return;
      if (res.ok) setSuggestions(res.data.suggestions ?? []);
      else setError(res.message);
      setLoading(false);
    });
    api.get<DashboardStatsResp>('/dashboard/stats').then((d) => {
      if (!cancelled) setStats(d.stats ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Real SLA data from /api/dashboard/stats. Falls back to zeros if
  // the endpoint hasn't loaded yet — charts show cleanly either way.
  const slaData = useMemo(() => {
    const raw = stats?.sla_breakdown ?? [
      { age: '<3d', count: 0 }, { age: '3-7d', count: 0 },
      { age: '7-14d', count: 0 }, { age: '14d+', count: 0 },
    ];
    const colorFor: Record<string, string> = {
      '<3d': GROW, '3-7d': SAVANNA, '7-14d': SUN, '14d+': FLAG,
    };
    return raw.map((b) => ({ ...b, fill: colorFor[b.age] ?? SAVANNA }));
  }, [stats]);

  const actions: VerdictAction[] = (suggestions ?? []).slice(0, 3).map((s) => ({
    label: s.title,
    severity: s.severity ?? 'info',
    onClick: () => window.dispatchEvent(new CustomEvent('kuja:open-copilot')),
  }));

  const tone = actions.some((a) => a.severity === 'critical') ? 'danger' : 'spark';

  return (
    <div className="space-y-4">
      <VerdictCard
        tone={tone}
        eyebrow="YOUR REVIEW QUEUE"
        headline={suggestions && suggestions.length > 0 ? 'AI has ranked your queue by review priority.' : 'Queue is clear.'}
        body={error ?? undefined}
        aiBadge={suggestions ? 'AI prioritized' : undefined}
        actions={actions}
        loading={loading}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="SLA breakdown"
          subtitle="Reviews by age in queue"
          icon={AlarmClock}
          caption={{
            chartType: 'sla-breakdown',
            data: slaData,
            context: 'Reviewer queue SLA distribution',
          }}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={50}>
            <PieChart>
              <Pie data={slaData} dataKey="count" nameKey="age" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {slaData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="kuja-chart-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitCompare className="h-4 w-4 text-muted-foreground" />
            Compare applications
          </div>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Select 2-5 applications from your queue to compare side-by-side.
            AI aligns strengths, weaknesses, and flags coordinated submissions.
          </p>
          <Button
            className="mt-4 bg-[hsl(var(--kuja-spark))] text-white hover:bg-[hsl(262_70%_45%)]"
            onClick={() => window.dispatchEvent(new CustomEvent('kuja:open-copilot'))}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            Open compare mode
          </Button>
        </div>
      </div>
    </div>
  );
}
