'use client';

/**
 * Phase 40 — NGO-facing budget input for network grants.
 *
 * NEAR's hard gate at /submit requires every line to be classified as
 * direct-to-community / operational / indirect, and the direct share
 * must meet the window's threshold (80% single-org / 70% consortium).
 * To do that, the NGO must record their budget structured.
 *
 * Renders:
 *   - One row per budget line (label, amount)
 *   - Add / remove buttons
 *   - Live total + a soft "approximate direct share" hint (counts lines
 *     whose label contains community-spend keywords as direct, mirrors
 *     the deterministic fallback in NetworkAIService)
 *   - Save button → PUT /api/applications/<id>
 *
 * Hidden when the application is not in 'draft' (post-submit edits
 * route through donor-facing flows).
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Loader2, Coins } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Line {
  item: string;
  amount: number | '';
}

interface Props {
  applicationId: number;
  initial: Array<{ item?: string; amount?: number }> | null | undefined;
  status: string;
  /** Window's single-org or consortium threshold for soft display. */
  thresholdHint?: number;
}

// Mirrors the deterministic fallback heuristic in
// NetworkAIService._fallback_budget_classification: any line whose label
// hints at community spend counts toward direct. Operator-facing AI uses
// the real Claude classifier; this hint is purely for the NGO's awareness.
const DIRECT_KEYWORDS = [
  'cash transfer', 'voucher', 'community', 'household', 'beneficiar',
  'distribution', 'transfer to', 'food', 'shelter', 'wash', 'water',
  'sanitation', 'hygiene', 'nfi', 'protection', 'school feeding',
];

function classifyHint(label: string): 'direct' | 'operational' | 'indirect' {
  const ln = label.toLowerCase();
  if (DIRECT_KEYWORDS.some((k) => ln.includes(k))) return 'direct';
  if (/(rent|admin|office|head ?office|hq|overhead|indirect)/.test(ln)) return 'indirect';
  return 'operational';
}

export function NgoBudgetPanel({ applicationId, initial, status, thresholdHint = 80 }: Props) {
  const [lines, setLines] = useState<Line[]>(() => {
    if (Array.isArray(initial) && initial.length > 0) {
      return initial.map((l) => ({
        item: l.item ?? '',
        amount: typeof l.amount === 'number' ? l.amount : '',
      }));
    }
    return [{ item: '', amount: '' }];
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Array.isArray(initial) && initial.length > 0) {
      setLines(initial.map((l) => ({
        item: l.item ?? '',
        amount: typeof l.amount === 'number' ? l.amount : '',
      })));
    }
  }, [initial]);

  const { total, directHint } = useMemo(() => {
    let sum = 0;
    let direct = 0;
    for (const l of lines) {
      const amt = Number(l.amount) || 0;
      sum += amt;
      if (l.item && classifyHint(l.item) === 'direct') direct += amt;
    }
    return { total: sum, directHint: sum > 0 ? (direct / sum) * 100 : 0 };
  }, [lines]);

  const editable = status === 'draft';

  function update(idx: number, field: keyof Line, value: string) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'amount') {
        const cleaned = value.replace(/[^0-9.]/g, '');
        return { ...l, amount: cleaned === '' ? '' : Number(cleaned) };
      }
      return { ...l, item: value };
    }));
  }

  function addLine() {
    setLines((prev) => [...prev, { item: '', amount: '' }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const cleaned = lines
      .map((l) => ({ item: l.item.trim(), amount: Number(l.amount) || 0 }))
      .filter((l) => l.item && l.amount > 0);
    if (cleaned.length === 0) {
      toast.error('Add at least one budget line before saving.');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/applications/${applicationId}`, { budget_lines: cleaned });
      toast.success('Budget saved.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  const hintMeets = directHint >= thresholdHint;

  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Coins className="w-4 h-4 text-[hsl(var(--kuja-spark))] mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">Budget</h2>
            <p className="text-xs text-muted-foreground">
              Required for NEAR grants. The Oversight Body checks that at least{' '}
              <span className="font-semibold">{thresholdHint}%</span> of your budget
              reaches the community directly (cash, vouchers, in-kind to households).
              Below that threshold, submission is blocked.
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {lines.map((l, idx) => {
          const hint = l.item ? classifyHint(l.item) : null;
          const hintColor =
            hint === 'direct' ? 'text-[hsl(var(--kuja-grow))]'
            : hint === 'indirect' ? 'text-destructive'
            : hint === 'operational' ? 'text-[hsl(var(--kuja-sun))]'
            : 'text-muted-foreground';
          return (
            <li key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={l.item}
                onChange={(e) => update(idx, 'item', e.target.value)}
                disabled={!editable || busy}
                placeholder="e.g. Cash transfers to households"
                className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-border bg-background text-sm"
              />
              <input
                type="text"
                inputMode="decimal"
                value={l.amount === '' ? '' : String(l.amount)}
                onChange={(e) => update(idx, 'amount', e.target.value)}
                disabled={!editable || busy}
                placeholder="0"
                className="w-28 px-2 py-1.5 rounded-md border border-border bg-background text-sm text-right font-mono"
              />
              {hint && (
                <span className={`text-[10px] uppercase tracking-wide font-semibold ${hintColor} w-20 text-right`}>
                  {hint}
                </span>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={busy || lines.length === 1}
                  className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                  aria-label="Remove line"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addLine}
            disabled={busy}
            className="px-2 py-1 rounded-md text-xs font-semibold border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add line
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-clay))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save budget
          </button>
        </div>
      )}

      <div className="border-t border-border pt-3 text-xs grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="kuja-numeric text-base font-bold mt-0.5">{total.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Approx. direct share (your read)
          </div>
          <div className={`kuja-numeric text-base font-bold mt-0.5 ${hintMeets ? 'text-[hsl(var(--kuja-grow))]' : 'text-[hsl(var(--kuja-sun))]'}`}>
            {directHint.toFixed(1)}%
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Heuristic only — the OB&apos;s AI classifier is the authoritative check.
          </p>
        </div>
      </div>
    </div>
  );
}
