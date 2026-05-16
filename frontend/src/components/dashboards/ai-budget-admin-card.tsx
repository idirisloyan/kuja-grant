'use client';

/**
 * AIBudgetAdminCard — per-org AI spend + cap management (Phase 5).
 *
 * Admin-only widget. Shows the month-to-date AI spend for every org,
 * highlights orgs near or over their cap, and lets the admin set / adjust
 * a monthly USD cap inline.
 *
 * Also surfaces a "skipped due to budget" rollup — which endpoints have
 * been blocked by the budget gate this month, so the admin knows where
 * to either raise the cap or optimise the call.
 */

import { useEffect, useState } from 'react';
import { Wallet, Loader2, AlertTriangle, CheckCircle2, Pencil, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface OrgSpend {
  org_id: number;
  org_name: string;
  budget_usd: number | null;
  spent_usd: number;
  remaining_usd: number | null;
  pct_used: number | null;
  successful_calls: number;
  skipped_due_to_budget: number;
}

interface SpendReport {
  period_start: string;
  orgs: OrgSpend[];
  skipped_by_endpoint: { endpoint: string; count: number }[];
}

function pctTone(pct: number | null) {
  if (pct === null) return 'text-[hsl(var(--kuja-ink-soft))]';
  if (pct >= 100) return 'text-[hsl(var(--kuja-flag))]';
  if (pct >= 80) return 'text-[hsl(var(--kuja-sun))]';
  return 'text-[hsl(var(--kuja-grow))]';
}

function ProgressBar({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <div className="h-1.5 rounded-full bg-[hsl(var(--kuja-ink-soft)/0.2)]" />;
  }
  const clamped = Math.min(100, Math.max(0, pct));
  const color = pct >= 100 ? 'bg-[hsl(var(--kuja-flag))]'
    : pct >= 80 ? 'bg-[hsl(var(--kuja-sun))]'
    : 'bg-[hsl(var(--kuja-grow))]';
  return (
    <div className="h-1.5 rounded-full bg-[hsl(var(--kuja-ink-soft)/0.15)] overflow-hidden">
      <div className={cn('h-full', color)} style={{ width: `${clamped}%`, transition: 'width 300ms' }} />
    </div>
  );
}

function BudgetEditor({ orgId, current, onSaved }: {
  orgId: number;
  current: number | null;
  onSaved: (newBudget: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(current?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--kuja-clay))] hover:underline"
        aria-label="Edit budget"
      >
        <Pencil className="w-3 h-3" /> Edit
      </button>
    );
  }

  const save = async (raw: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const budget_usd = raw === null || raw === '' ? null : Number(raw);
      if (raw !== null && raw !== '' && Number.isNaN(budget_usd as number)) {
        throw new Error('Enter a number or leave blank for unlimited.');
      }
      await api.put(`/api/ai-budget/org/${orgId}`, { budget_usd });
      onSaved(budget_usd);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="blank = unlimited"
        className="w-28 rounded border border-[hsl(var(--border))] px-2 py-0.5 text-xs"
      />
      <button
        type="button"
        onClick={() => save(value)}
        disabled={saving}
        className="rounded bg-[hsl(var(--kuja-clay))] p-1 text-white hover:opacity-90 disabled:opacity-50"
        aria-label="Save"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null); }}
        className="rounded border border-[hsl(var(--border))] p-1 hover:bg-[hsl(var(--kuja-sand-50))]"
        aria-label="Cancel"
      >
        <X className="w-3 h-3" />
      </button>
      {error && <span className="text-[10px] text-[hsl(var(--kuja-flag))]">{error}</span>}
    </div>
  );
}

export function AIBudgetAdminCard() {
  const [data, setData] = useState<SpendReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get<{ report: SpendReport }>('/api/ai-budget/admin/spend');
      setData(resp.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> <span className="kuja-eyebrow">AI spend</span></div>
        <div className="kuja-shimmer mt-3 h-32 rounded" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4"><span className="kuja-eyebrow">AI spend</span>
        <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-1">Unavailable: {error}</p>
      </Card>
    );
  }

  const orgs = data.orgs ?? [];
  const totalSpent = orgs.reduce((sum, o) => sum + o.spent_usd, 0);
  const totalSkipped = orgs.reduce((sum, o) => sum + o.skipped_due_to_budget, 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-2">
          <div className="p-2 rounded-md bg-[hsl(var(--kuja-grow)/0.1)]">
            <Wallet className="w-5 h-5 text-[hsl(var(--kuja-grow))]" />
          </div>
          <div>
            <div className="kuja-eyebrow">AI Budget & Spend</div>
            <h3 className="text-base font-semibold mt-0.5">
              {formatMoney(totalSpent, { currency: 'USD', compact: totalSpent >= 100 })} this month
            </h3>
            <p className="text-xs text-[hsl(var(--kuja-ink-soft))] mt-0.5">
              Period start: {new Date(data.period_start).toLocaleDateString()}.
              {totalSkipped > 0 && <> · <strong className="text-[hsl(var(--kuja-sun))]">{totalSkipped} calls skipped due to budget.</strong></>}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[hsl(var(--kuja-ink-soft))] border-b border-[hsl(var(--border))]">
              <th className="py-2 text-left font-semibold">Org</th>
              <th className="py-2 text-right font-semibold">Spent</th>
              <th className="py-2 text-right font-semibold">Budget</th>
              <th className="py-2 text-left font-semibold w-40">Usage</th>
              <th className="py-2 text-right font-semibold">Skipped</th>
              <th className="py-2 text-left font-semibold pl-2">Manage</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-[hsl(var(--kuja-ink-soft))]">No AI usage this month.</td></tr>
            )}
            {orgs.map((o) => (
              <tr key={o.org_id} className="border-b border-[hsl(var(--border))] last:border-b-0">
                <td className="py-2">
                  <a href={`/trust?org=${o.org_id}`} className="font-semibold text-[hsl(var(--kuja-ink))] hover:underline">{o.org_name}</a>
                </td>
                <td className="py-2 text-right kuja-numeric">{formatMoney(o.spent_usd, { currency: 'USD' })}</td>
                <td className="py-2 text-right kuja-numeric">
                  {o.budget_usd === null ? <span className="text-[hsl(var(--kuja-ink-soft))]">unlimited</span> : formatMoney(o.budget_usd, { currency: 'USD' })}
                </td>
                <td className="py-2 pr-3">
                  <ProgressBar pct={o.pct_used} />
                  <div className={cn('text-[10px] mt-0.5', pctTone(o.pct_used))}>
                    {o.pct_used !== null ? `${o.pct_used}%` : '—'}
                  </div>
                </td>
                <td className="py-2 text-right">
                  {o.skipped_due_to_budget > 0 ? (
                    <Badge variant="outline" className="border-[hsl(var(--kuja-sun))] text-[hsl(var(--kuja-sun))]">
                      <AlertTriangle className="w-3 h-3 mr-1" /> {o.skipped_due_to_budget}
                    </Badge>
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--kuja-grow))] inline" aria-label="None skipped" />
                  )}
                </td>
                <td className="py-2 pl-2">
                  <BudgetEditor
                    orgId={o.org_id}
                    current={o.budget_usd}
                    onSaved={(b) => { setData({ ...data, orgs: data.orgs.map(x => x.org_id === o.org_id ? { ...x, budget_usd: b, pct_used: b ? Math.round((x.spent_usd / b) * 100 * 10) / 10 : null, remaining_usd: b ? Math.max(0, b - x.spent_usd) : null } : x) }); }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.skipped_by_endpoint.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[hsl(var(--border))]">
          <div className="kuja-label">Skipped by endpoint</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {data.skipped_by_endpoint.map((e) => (
              <Badge key={e.endpoint} variant="outline" className="text-[10px]">
                <code>{e.endpoint}</code> <span className="ml-1 text-[hsl(var(--kuja-sun))]">{e.count}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
