'use client';

/**
 * Phase 99 — Per-tenant AI cost meter (admin).
 *
 * Phase 97 ship 'd /admin/ai-spend (day-buckets across all tenants).
 * This page is the missing per-tenant cut: who is using the AI budget,
 * by how much, and which surfaces drive their share. The team needs
 * this before any per-tenant cap conversation with a customer.
 *
 * Backend: /api/admin/ai-cost-by-tenant joins AICallLog → User →
 * Organization and reuses the _PRICING dict from admin_health so the
 * dollar math stays in one place.
 */

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  PageShell, PageBack, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { DollarSign, Building2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/components/shared/empty-state';

interface TenantRow {
  org_id: number | null;
  org_name: string | null;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  usd: number;
  share_pct: number;
}

interface Resp {
  success: boolean;
  window_days: number;
  total_usd: number;
  by_tenant: TenantRow[];
  pricing_note: string;
}

const WINDOWS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function usd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `<$0.01`;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function AICostByTenantPage() {
  const user = useAuthStore((s) => s.user);
  const [days, setDays] = useState(30);

  const { data, error, isLoading } = useSWR<Resp>(
    user?.role === 'admin' ? `/admin/ai-cost-by-tenant?days=${days}` : null,
    (url: string) => api.get<Resp>(url),
  );

  if (user?.role !== 'admin') {
    return (
      <PageShell>
        <PageHeader title="AI cost by tenant" subtitle="Admin only." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageBack href="/admin/ai-telemetry" label="Back to AI telemetry" />
      <PageHeader
        title="AI cost by tenant"
        subtitle="Token spend attributed to each org. Joins call logs through user → org."
      />

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Window:</span>
        {WINDOWS.map((w) => (
          <button
            type="button"
            key={w.days}
            onClick={() => setDays(w.days)}
            className={`text-xs font-semibold rounded-md px-2.5 py-1 ${
              days === w.days
                ? 'bg-[hsl(var(--kuja-clay))] text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <PageMain>
        {isLoading && <div className="kuja-shimmer h-32 rounded-lg" />}
        {error && (
          <div className="border border-rose-200 bg-rose-50 rounded-md p-4 text-sm text-rose-800">
            Could not load tenant cost rollup.
          </div>
        )}
        {data?.success && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <SummaryTile
                icon={DollarSign}
                label={`Total spend · last ${days}d`}
                value={usd(data.total_usd)}
              />
              <SummaryTile
                icon={Building2}
                label="Tenants with AI usage"
                value={String(data.by_tenant.filter((t) => t.org_id != null).length)}
                sub="Plus a 'Platform' bucket for cron / anonymous calls"
              />
              <SummaryTile
                icon={AlertTriangle}
                label="Top tenant share"
                value={
                  data.by_tenant.length > 0
                    ? `${data.by_tenant[0].share_pct}%`
                    : '—'
                }
                sub={data.by_tenant.length > 0
                  ? data.by_tenant[0].org_name ?? 'Unattributed'
                  : 'No usage yet'}
              />
            </div>

            {data.by_tenant.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title="No AI cost recorded in this window"
                body={`No AICallLog rows for the last ${days} days. Either the window is too short ` +
                  `or AI surfaces aren't being exercised. Pick a longer window or check ` +
                  `/admin/system-health for backend status.`}
              />
            ) : (
              <div className="border border-border rounded-lg bg-card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Tenant</th>
                      <th className="text-right p-3">Calls</th>
                      <th className="text-right p-3">Tokens in</th>
                      <th className="text-right p-3">Tokens out</th>
                      <th className="text-right p-3">USD</th>
                      <th className="text-right p-3">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_tenant.map((t) => (
                      <tr key={t.org_id ?? 'platform'} className="border-t border-border">
                        <td className="p-3 font-semibold">
                          {t.org_name ?? <span className="italic text-muted-foreground">Unattributed</span>}
                        </td>
                        <td className="p-3 text-right">{t.calls.toLocaleString()}</td>
                        <td className="p-3 text-right">{t.tokens_in.toLocaleString()}</td>
                        <td className="p-3 text-right">{t.tokens_out.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold">{usd(t.usd)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono">{t.share_pct}%</span>
                            <div className="h-1.5 w-12 rounded-full overflow-hidden bg-muted">
                              <div className="h-full bg-[hsl(var(--kuja-clay))]" style={{ width: `${t.share_pct}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              {data.pricing_note} See <code>/admin/ai-spend</code> for day-bucketed totals
              and <code>/admin/ai-spend/forecast</code> for 30-day projection vs.
              <code className="mx-1">KUJA_AI_BUDGET_USD_30D</code>.
            </p>

            {/* Phase 231 — top users by AI cost over the same window. */}
            <ByUserTable days={days} />
            {/* Phase 250 — top feature events over the same window. */}
            <FeatureUsageTable days={days} />
          </>
        )}
      </PageMain>
    </PageShell>
  );
}

interface UserRow {
  user_id: number;
  user_name: string | null;
  user_email: string;
  role: string | null;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  usd: number;
}

function ByUserTable({ days }: { days: number }) {
  const [rows, setRows] = useState<UserRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ by_user: UserRow[] }>(`/admin/ai-cost-by-user?days=${days}&limit=20`).then((r) => {
      if (!cancelled) setRows(Array.isArray(r?.by_user) ? r.by_user : []);
    }).catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [days]);

  if (rows.length === 0) return null;

  return (
    <div className="border border-border rounded-lg bg-card overflow-x-auto mt-6">
      <div className="p-3 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
        Top users by AI cost ({days}d)
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">User</th>
            <th className="text-left p-3">Role</th>
            <th className="text-right p-3">Calls</th>
            <th className="text-right p-3">Tokens in</th>
            <th className="text-right p-3">Tokens out</th>
            <th className="text-right p-3">USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.user_id} className="border-t border-border">
              <td className="p-3 font-semibold">
                {u.user_name ?? u.user_email}
                {u.user_name && <div className="font-normal text-muted-foreground text-[10px]">{u.user_email}</div>}
              </td>
              <td className="p-3 text-xs">{u.role ?? '—'}</td>
              <td className="p-3 text-right">{u.calls.toLocaleString()}</td>
              <td className="p-3 text-right">{u.tokens_in.toLocaleString()}</td>
              <td className="p-3 text-right">{u.tokens_out.toLocaleString()}</td>
              <td className="p-3 text-right font-semibold">${u.usd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FeatureRow {
  event_name: string;
  count: number;
}

function FeatureUsageTable({ days }: { days: number }) {
  const [data, setData] = useState<{ top_events: FeatureRow[]; total_events: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<typeof data>(`/admin/feature-usage?days=${days}`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [days]);

  if (!data || data.top_events.length === 0) return null;

  return (
    <div className="border border-border rounded-lg bg-card overflow-x-auto mt-6">
      <div className="p-3 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
        Top feature events ({days}d) — {data.total_events.toLocaleString()} total
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">Event</th>
            <th className="text-right p-3">Count</th>
          </tr>
        </thead>
        <tbody>
          {data.top_events.map((e) => (
            <tr key={e.event_name} className="border-t border-border">
              <td className="p-3 font-mono text-xs">{e.event_name}</td>
              <td className="p-3 text-right tabular-nums">{e.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTile({
  icon: Icon, label, value, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-border bg-card rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="kuja-display text-3xl mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
