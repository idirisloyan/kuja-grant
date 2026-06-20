'use client';

/**
 * Phase 101 — Synthetic production monitor admin dashboard.
 *
 * Lists recent monitor sweeps + per-probe failure-rate breakdown.
 * Manual "Run now" button kicks a sweep and persists the result.
 */

import { useState } from 'react';
import useSWR from 'swr';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';

interface Probe {
  name: string;
  ok: boolean;
  slow: boolean;
  duration_ms: number;
  status_code: number | null;
  error?: string | null;
  note?: string | null;
}
interface Run {
  id: number;
  started_at: string;
  finished_at: string;
  total_ms: number;
  base_url: string;
  failures: number;
  slow_count: number;
  probes: Probe[];
}
interface PerProbe { name: string; runs: number; fails: number; failure_rate_pct: number; }
interface Resp {
  success: boolean;
  window_days: number;
  total_runs: number;
  failed_runs: number;
  total_failures: number;
  avg_total_ms: number;
  per_probe: PerProbe[];
  runs: Run[];
}

const WINDOWS = [{ label: '24h', days: 1 }, { label: '3d', days: 3 }, { label: '7d', days: 7 }, { label: '30d', days: 30 }];

export default function SyntheticMonitorPage() {
  const user = useAuthStore((s) => s.user);
  const [days, setDays] = useState(7);
  const [running, setRunning] = useState(false);

  const { data, mutate, isLoading, error } = useSWR<Resp>(
    user?.role === 'admin' ? `/admin/synthetic-monitor?days=${days}` : null,
    (url: string) => api.get<Resp>(url),
  );

  if (user?.role !== 'admin') {
    return <PageShell><PageHeader title="Synthetic monitor" subtitle="Admin only." /></PageShell>;
  }

  const runNow = async () => {
    setRunning(true);
    try {
      await api.post('/admin/synthetic-monitor/run', {});
      await mutate();
    } finally {
      setRunning(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Synthetic production monitor"
        subtitle="Probes critical user paths every 30 min. Pages admins on failure."
      />
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Window:</span>
        {WINDOWS.map((w) => (
          <button
            type="button"
            key={w.days}
            onClick={() => setDays(w.days)}
            className={`text-xs font-semibold rounded-md px-2.5 py-1 ${
              days === w.days ? 'bg-[hsl(var(--kuja-clay))] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >{w.label}</button>
        ))}
        <div className="flex-1" />
        <Button onClick={runNow} disabled={running} size="sm">
          {running ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Run now
        </Button>
      </div>
      <PageMain>
        {isLoading && <div className="kuja-shimmer h-32 rounded-lg" />}
        {error && <div className="border border-rose-200 bg-rose-50 rounded-md p-4 text-sm text-rose-800">Could not load.</div>}
        {data?.success && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
              <Tile icon={Activity} label="Total runs" value={String(data.total_runs)} />
              <Tile
                icon={CheckCircle2}
                label="Runs with no failures"
                value={String(data.total_runs - data.failed_runs)}
                tone={data.failed_runs > 0 ? 'warning' : 'success'}
              />
              <Tile
                icon={AlertTriangle}
                label="Total probe failures"
                value={String(data.total_failures)}
                tone={data.total_failures > 0 ? 'warning' : 'success'}
              />
              <Tile icon={Clock} label="Avg duration" value={`${data.avg_total_ms} ms`} />
            </div>

            <h2 className="text-sm font-semibold mb-2">Per-probe failure rate</h2>
            <div className="border border-border rounded-lg bg-card overflow-x-auto mb-6">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Probe</th>
                    <th className="text-right p-3">Runs</th>
                    <th className="text-right p-3">Fails</th>
                    <th className="text-right p-3">Failure rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_probe.map((p) => (
                    <tr key={p.name} className="border-t border-border">
                      <td className="p-3 font-mono text-[11px]">{p.name}</td>
                      <td className="p-3 text-right">{p.runs}</td>
                      <td className="p-3 text-right">{p.fails}</td>
                      <td className={`p-3 text-right font-semibold ${
                        p.failure_rate_pct >= 25 ? 'text-rose-700' :
                          p.failure_rate_pct >= 10 ? 'text-amber-700' :
                            'text-emerald-700'
                      }`}>{p.failure_rate_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="text-sm font-semibold mb-2">Recent runs</h2>
            <ul className="space-y-2">
              {data.runs.map((r) => (
                <li key={r.id} className="border border-border rounded-md bg-card p-3">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-mono">{new Date(r.started_at).toLocaleString()}</span>
                    <span className="text-muted-foreground">· {r.total_ms} ms</span>
                    {r.failures > 0
                      ? <span className="text-rose-700 font-semibold">{r.failures} fail</span>
                      : <span className="text-emerald-700 font-semibold">all green</span>}
                    {r.slow_count > 0 && <span className="text-amber-700">{r.slow_count} slow</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.probes.map((p) => (
                      <span
                        key={p.name}
                        title={p.error || p.note || ''}
                        className={`inline-flex items-center text-[10px] font-mono rounded px-1.5 py-0.5 ${
                          !p.ok ? 'bg-rose-100 text-rose-800' :
                            p.slow ? 'bg-amber-100 text-amber-800' :
                              'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {p.name} {p.duration_ms}ms
                      </span>
                    ))}
                  </div>
                </li>
              ))}
              {data.runs.length === 0 && (
                <li className="text-xs text-muted-foreground italic">
                  No runs yet — click <strong>Run now</strong> to fire one, or wire the cron at <code>/api/cron/synthetic-monitor</code> for scheduled runs.
                </li>
              )}
            </ul>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}

function Tile({ icon: Icon, label, value, tone = 'neutral' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  const toneClass = tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : '';
  return (
    <div className="border border-border bg-card rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`kuja-display text-3xl mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}
