'use client';

/**
 * Approved activities editor — round page, OB only (July 2026).
 *
 * The reporting baseline: what each partner was funded to do and the
 * approved budget per line (USD). Partners then report actuals against
 * exactly these lines on their phone page. Kept deliberately small —
 * name + budget lines; the grant agreement stays the source of truth
 * for everything longer.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ClipboardList, Plus, Trash2, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface BudgetLine { label: string; amount: number }
interface Activity {
  id: number; partner_id: number; name: string;
  budget_lines: BudgetLine[];
}
interface Participant { partner_id: number; partner_name: string | null; stage: string }

const DEFAULT_LINES = ['Personnel', 'Supplies & Materials',
  'Transport & Logistics', 'Direct Beneficiary Support', 'Admin / Overheads'];

export function ApprovedActivitiesCard({
  roundId, participants, isOperator,
}: { roundId: number; participants: Participant[]; isOperator: boolean }) {
  const [acts, setActs] = useState<Activity[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // add form
  const [partnerId, setPartnerId] = useState('');
  const [name, setName] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    api.get<{ activities: Activity[] }>(
      `/api/proximate/rounds/${roundId}/approved-activities`,
    ).then((r) => setActs(r.activities)).catch(() => setActs([]));
  }, [roundId]);

  useEffect(() => {
    if (isOperator) refresh();
  }, [isOperator, refresh]);

  if (!isOperator || acts === null) return null;
  const roster = participants.filter((p) => p.stage !== 'withdrawn');
  if (roster.length === 0 && acts.length === 0) return null;

  const partnerName = (pid: number) =>
    roster.find((p) => p.partner_id === pid)?.partner_name || `Partner #${pid}`;

  const add = async () => {
    if (!partnerId || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const budget_lines = DEFAULT_LINES
        .map((label) => ({ label, amount: Number(amounts[label] || 0) }))
        .filter((l) => l.amount > 0);
      await api.post(`/api/proximate/rounds/${roundId}/approved-activities`,
                     { partner_id: Number(partnerId), name: name.trim(),
                       budget_lines });
      setName('');
      setAmounts({});
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await api.delete(`/api/proximate/approved-activities/${id}`);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <button type="button" onClick={() => setOpen((o) => !o)}
              className="w-full flex items-center gap-2 text-left">
        <ClipboardList className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold flex-1">
          Approved activities ({acts.length})
        </h2>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            The reporting baseline: partners report actual spend against
            these budget lines (USD) on their phone page.
          </p>
          {acts.map((a) => (
            <div key={a.id} className="rounded-md border px-3 py-2 text-xs space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium flex-1 min-w-0 truncate">
                  {partnerName(a.partner_id)} — {a.name}
                </span>
                <button type="button" onClick={() => remove(a.id)} disabled={busy}
                        aria-label="Delete activity"
                        className="text-muted-foreground hover:text-rose-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-muted-foreground">
                {(a.budget_lines || []).map((l) =>
                  `${l.label} $${Number(l.amount).toLocaleString()}`).join(' · ')
                  || 'No budget lines'}
              </p>
            </div>
          ))}
          {/* add form */}
          <div className="rounded-md border border-dashed p-3 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
                      className="text-xs rounded-md border bg-background px-2 py-1.5 min-w-[160px]">
                <option value="">Partner…</option>
                {roster.map((p) => (
                  <option key={p.partner_id} value={p.partner_id}>
                    {p.partner_name || `Partner #${p.partner_id}`}
                  </option>
                ))}
              </select>
              <input value={name} onChange={(e) => setName(e.target.value)}
                     placeholder="Activity name (e.g. Emergency shelter kits)"
                     className="flex-1 min-w-[200px] text-xs rounded-md border bg-background px-2 py-1.5" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {DEFAULT_LINES.map((label) => (
                <label key={label} className="text-[10px] text-muted-foreground space-y-0.5">
                  {label} (USD)
                  <input type="number" inputMode="numeric" min={0}
                         value={amounts[label] || ''}
                         onChange={(e) => setAmounts((prev) =>
                           ({ ...prev, [label]: e.target.value }))}
                         placeholder="0"
                         className="w-full text-xs rounded-md border bg-background px-2 py-1 text-foreground" />
                </label>
              ))}
            </div>
            <Button size="sm" variant="outline" disabled={busy || !partnerId || !name.trim()}
                    onClick={add}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
                    : <Plus className="w-3.5 h-3.5 me-1" />}
              Add activity
            </Button>
            {error && <p className="text-[10px] text-rose-600">{error}</p>}
          </div>
        </div>
      )}
    </Card>
  );
}
