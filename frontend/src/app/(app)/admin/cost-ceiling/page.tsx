'use client';

/**
 * Phase 108 — Per-tenant AI cost ceiling admin.
 *
 * Set / clear monthly USD cap per org. See current month-to-date spend
 * and % used. Crossing 75%/90%/100% fires admin notifications
 * automatically (cost_ceiling_service hook in replay_service).
 */

import { useState } from 'react';
import useSWR from 'swr';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';
import { DollarSign, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface OrgCap {
  org_id: number;
  org_name: string;
  org_type: string | null;
  budget_usd: number | null;
  spent_usd: number;
  pct_used: number | null;
  reason?: string;
}
interface Resp { success: boolean; orgs: OrgCap[]; }

export default function CostCeilingPage() {
  const user = useAuthStore((s) => s.user);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data, error, isLoading, mutate } = useSWR<Resp>(
    user?.role === 'admin' ? `/admin/cost-ceiling` : null,
    (url: string) => api.get<Resp>(url),
  );

  if (user?.role !== 'admin') {
    return <PageShell><PageHeader title="Cost ceiling" subtitle="Admin only." /></PageShell>;
  }

  const saveCap = async (orgId: number) => {
    const raw = edits[orgId];
    const trimmed = (raw ?? '').trim();
    const payload = trimmed === '' || trimmed.toLowerCase() === 'null'
      ? { budget_usd: null }
      : { budget_usd: Number(trimmed) };
    setSavingId(orgId);
    try {
      await api.put(`/admin/cost-ceiling/${orgId}`, payload);
      await mutate();
      setEdits((prev) => { const { [orgId]: _, ...rest } = prev; return rest; });
    } catch (e) {
      alert((e as Error).message || 'Save failed.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Per-tenant AI cost ceiling"
        subtitle="Set monthly USD caps. Crossing 75% / 90% / 100% fires admin notifications automatically."
      />
      <PageMain>
        {isLoading && <div className="kuja-shimmer h-32 rounded-lg" />}
        {error && <div className="border border-rose-200 bg-rose-50 rounded-md p-4 text-sm text-rose-800">Could not load.</div>}
        {data?.success && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Tile icon={DollarSign} label="Orgs with caps set" value={String(data.orgs.filter((o) => o.budget_usd != null).length)} />
              <Tile icon={AlertTriangle} label="Orgs ≥ 75% used" value={String(data.orgs.filter((o) => (o.pct_used ?? 0) >= 75).length)} tone="warning" />
              <Tile icon={AlertTriangle} label="Orgs at/over cap" value={String(data.orgs.filter((o) => (o.pct_used ?? 0) >= 100).length)} tone="danger" />
            </div>

            <div className="border border-border rounded-lg bg-card overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Org</th>
                    <th className="text-right p-3">Spent (MTD)</th>
                    <th className="text-left p-3">Monthly cap (USD)</th>
                    <th className="text-right p-3">% used</th>
                    <th className="text-right p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orgs.map((o) => {
                    const pct = o.pct_used;
                    const editing = edits[o.org_id];
                    const tone =
                      pct == null ? '' :
                        pct >= 100 ? 'text-rose-700 font-semibold' :
                          pct >= 90 ? 'text-rose-700' :
                            pct >= 75 ? 'text-amber-700' :
                              'text-emerald-700';
                    return (
                      <tr key={o.org_id} className="border-t border-border align-top">
                        <td className="p-3">
                          <div className="font-semibold">{o.org_name}</div>
                          <div className="text-[10px] text-muted-foreground">{o.org_type ?? '—'}</div>
                        </td>
                        <td className="p-3 text-right">${o.spent_usd.toFixed(2)}</td>
                        <td className="p-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editing ?? (o.budget_usd != null ? String(o.budget_usd) : '')}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [o.org_id]: e.target.value }))}
                            placeholder="(no cap)"
                            className="w-28 text-sm rounded-md border border-border bg-card px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--kuja-clay)/0.3)]"
                          />
                          <span className="ml-2 text-[10px] text-muted-foreground">empty = unlimited</span>
                        </td>
                        <td className={`p-3 text-right ${tone}`}>{pct == null ? '—' : `${pct}%`}</td>
                        <td className="p-3 text-right">
                          {editing !== undefined && (
                            <Button size="sm" onClick={() => saveCap(o.org_id)} disabled={savingId === o.org_id}>
                              {savingId === o.org_id ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Save'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground mt-4">
              Pricing: $3/M input + $15/M output (Sonnet 4.6). The hard
              gate (BudgetExceededError) blocks AI calls once spent ≥ cap.
              Soft thresholds (75% / 90% / 100%) fire admin notifications
              via <code>cost_ceiling_service.maybe_fire_threshold_notification</code>.
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
