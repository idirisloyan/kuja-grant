'use client';

/**
 * Phase 106 — Per-tenant health dashboard.
 *
 * Proactive churn-prevention surface. An admin scans this once a week
 * and calls anyone trending red before they notice.
 */

import { useState } from 'react';
import useSWR from 'swr';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { Heart, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface TenantRow {
  org_id: number;
  org_name: string;
  org_type: string | null;
  country: string | null;
  members: number;
  admins: number;
  ai_calls: number;
  ai_failures: number;
  ai_failure_rate_pct: number;
  applications_total: number;
  applications_draft: number;
  applications_submitted: number;
  stale_drafts: number;
  last_activity_at: string | null;
  has_active_passport: boolean;
  health: 'red' | 'amber' | 'green';
  flags: string[];
}
interface Resp {
  success: boolean;
  window_days: number;
  summary: { red: number; amber: number; green: number; total_tenants: number };
  tenants: TenantRow[];
}

const WINDOWS = [{ label: '7d', days: 7 }, { label: '14d', days: 14 }, { label: '30d', days: 30 }];

const FLAG_DESCRIPTIONS: Record<string, string> = {
  ai_failure_rate_high: 'AI failure rate ≥ 25% over the window',
  ai_failure_rate_elevated: 'AI failure rate ≥ 10% over the window',
  many_stale_drafts: '5+ draft applications older than 30 days',
  drafts_without_ai_activity: 'Drafts exist but no AI usage at all',
  no_active_passport: 'No active Capacity Passport published',
};

export default function TenantHealthPage() {
  const user = useAuthStore((s) => s.user);
  const [days, setDays] = useState(7);

  const { data, isLoading, error } = useSWR<Resp>(
    user?.role === 'admin' ? `/admin/tenant-health?days=${days}` : null,
    (url: string) => api.get<Resp>(url),
  );

  if (user?.role !== 'admin') {
    return <PageShell><PageHeader title="Tenant health" subtitle="Admin only." /></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        title="Tenant health"
        subtitle="Per-tenant rollup of AI failure rate, stale drafts, and Trust Profile state."
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
      </div>
      <PageMain>
        {isLoading && <div className="kuja-shimmer h-32 rounded-lg" />}
        {error && <div className="border border-rose-200 bg-rose-50 rounded-md p-4 text-sm text-rose-800">Could not load.</div>}
        {data?.success && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
              <Tile icon={Heart} label="Total tenants" value={String(data.summary.total_tenants)} />
              <Tile icon={CheckCircle2} label="Green" value={String(data.summary.green)} tone="success" />
              <Tile icon={AlertCircle} label="Amber" value={String(data.summary.amber)} tone={data.summary.amber > 0 ? 'warning' : 'neutral'} />
              <Tile icon={AlertTriangle} label="Red" value={String(data.summary.red)} tone={data.summary.red > 0 ? 'danger' : 'neutral'} />
            </div>

            <div className="border border-border rounded-lg bg-card overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Tenant</th>
                    <th className="text-left p-3">Health</th>
                    <th className="text-right p-3">AI calls / fail %</th>
                    <th className="text-right p-3">Drafts / stale</th>
                    <th className="text-right p-3">Submitted</th>
                    <th className="text-right p-3">Members</th>
                    <th className="text-left p-3">Passport</th>
                    <th className="text-left p-3">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.map((t) => (
                    <tr key={t.org_id} className="border-t border-border align-top">
                      <td className="p-3">
                        <div className="font-semibold">{t.org_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {t.org_type} · {t.country ?? '—'}
                        </div>
                      </td>
                      <td className="p-3">
                        <HealthChip health={t.health} flags={t.flags} />
                      </td>
                      <td className="p-3 text-right">
                        <div>{t.ai_calls}</div>
                        <div className={`text-[10px] ${
                          t.ai_failure_rate_pct >= 25 ? 'text-rose-700' :
                            t.ai_failure_rate_pct >= 10 ? 'text-amber-700' : 'text-muted-foreground'
                        }`}>{t.ai_failure_rate_pct}%</div>
                      </td>
                      <td className="p-3 text-right">
                        <div>{t.applications_draft}</div>
                        {t.stale_drafts > 0 && (
                          <div className="text-[10px] text-rose-700">{t.stale_drafts} stale</div>
                        )}
                      </td>
                      <td className="p-3 text-right">{t.applications_submitted}</td>
                      <td className="p-3 text-right">
                        {t.members}
                        {t.admins > 0 && <span className="text-[10px] text-muted-foreground"> · {t.admins} admin</span>}
                      </td>
                      <td className="p-3">
                        {t.has_active_passport
                          ? <span className="text-emerald-700 font-semibold">Active</span>
                          : <span className="text-muted-foreground italic">None</span>}
                      </td>
                      <td className="p-3 text-[10px] text-muted-foreground">
                        {t.last_activity_at
                          ? new Date(t.last_activity_at).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-4">
              Thresholds: <strong>red</strong> = AI failure ≥ 25% OR 5+ stale drafts. <strong>amber</strong> = AI failure ≥ 10% OR drafts without AI activity. Adjust in <code>app/routes/tenant_health_routes.py:_classify</code>.
            </p>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}

function Tile({ icon: Icon, label, value, tone = 'neutral' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success' ? 'text-emerald-700' :
      tone === 'warning' ? 'text-amber-700' :
        tone === 'danger' ? 'text-rose-700' : '';
  return (
    <div className="border border-border bg-card rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`kuja-display text-3xl mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function HealthChip({ health, flags }: { health: 'red' | 'amber' | 'green'; flags: string[] }) {
  const tone =
    health === 'red' ? 'bg-rose-50 text-rose-700 border-rose-200' :
      health === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' :
        'bg-emerald-50 text-emerald-700 border-emerald-200';
  return (
    <div className="space-y-1">
      <span
        title={flags.map((f) => FLAG_DESCRIPTIONS[f] ?? f).join('\n') || 'No flags'}
        className={`inline-block text-[10px] uppercase tracking-wider font-semibold rounded-full border px-2 py-0.5 ${tone}`}
      >{health}</span>
      {flags.length > 0 && (
        <ul className="text-[10px] text-muted-foreground">
          {flags.slice(0, 3).map((f) => (
            <li key={f}>· {FLAG_DESCRIPTIONS[f] ?? f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
