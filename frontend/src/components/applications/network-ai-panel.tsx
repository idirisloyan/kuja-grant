'use client';

/**
 * Phase 38 — Application AI surfaces for network-window grants.
 *
 * Two surfaces:
 *   1. Rubric scorer — POST /applications/<id>/ai-score-rubric
 *   2. Direct-to-community budget classifier —
 *      POST /applications/<id>/ai-classify-budget
 *
 * Hidden when the application's grant has no fund_window_id (i.e. it's a
 * legacy Kuja Marketplace grant, not a network grant). Visible to donors,
 * reviewers, and admins — NGOs see their own AI surfaces elsewhere.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Loader2, Calculator, ScrollText } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

type RubricResult = {
  ok?: boolean;
  total_score?: number;
  max_score?: number;
  summary?: string;
  criteria?: Array<{ id?: string; label?: string; score?: number; max?: number; rationale?: string }>;
};

type BudgetResult = {
  ok?: boolean;
  total?: number;
  direct_pct?: number;
  threshold_pct?: number;
  meets_threshold?: boolean;
  classifications?: Array<{ item?: string; amount?: number; bucket?: string; rationale?: string }>;
  summary?: string;
};

interface Props {
  applicationId: number;
  isConsortium?: boolean;
}

export function NetworkAiPanel({ applicationId, isConsortium = false }: Props) {
  const [rubric, setRubric] = useState<RubricResult | null>(null);
  const [rubricBusy, setRubricBusy] = useState(false);
  const [budget, setBudget] = useState<BudgetResult | null>(null);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [budgetText, setBudgetText] = useState(
    '# One line per budget item: "label, amount"\n' +
    'Cash transfers to households, 150000\n' +
    'Water trucking and storage, 60000\n' +
    'Field staff salaries (program), 40000\n' +
    'Office rent (HQ), 8000\n'
  );

  async function runRubric() {
    setRubricBusy(true);
    try {
      const r = await api.post<RubricResult>(`/applications/${applicationId}/ai-score-rubric`);
      setRubric(r);
      if (!r?.ok) toast.message('AI unavailable — fallback shown.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Rubric scoring failed.');
    } finally {
      setRubricBusy(false);
    }
  }

  function parseBudgetLines(): Array<{ item: string; amount: number }> {
    const lines = budgetText.split('\n');
    const out: Array<{ item: string; amount: number }> = [];
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const last = trimmed.lastIndexOf(',');
      if (last === -1) continue;
      const label = trimmed.slice(0, last).trim();
      const amountStr = trimmed.slice(last + 1).trim().replace(/[,\s]/g, '');
      const amount = Number(amountStr);
      if (label && Number.isFinite(amount) && amount > 0) {
        out.push({ item: label, amount });
      }
    }
    return out;
  }

  async function runBudget() {
    const budget_lines = parseBudgetLines();
    if (budget_lines.length === 0) {
      toast.error('Add at least one line: "label, amount"');
      return;
    }
    setBudgetBusy(true);
    try {
      const r = await api.post<BudgetResult>(
        `/applications/${applicationId}/ai-classify-budget`,
        { budget_lines, is_consortium: isConsortium },
      );
      setBudget(r);
      if (!r?.ok) toast.message('AI unavailable — fallback shown.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Budget classification failed.');
    } finally {
      setBudgetBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[hsl(var(--kuja-spark))]" />
        <h2 className="kuja-eyebrow">Network AI surfaces</h2>
      </div>

      {/* Rubric scorer */}
      <div className="border border-border rounded-lg bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <ScrollText className="w-4 h-4 text-[hsl(var(--kuja-spark))] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">Score against window rubric</h3>
              <p className="text-xs text-muted-foreground">
                AI grades the submission against every criterion on the window&apos;s
                evaluation rubric. Use as a second opinion before panel scoring.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={runRubric}
            disabled={rubricBusy}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-spark))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {rubricBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Run scorer
          </button>
        </div>
        {rubric && (
          <div className="border-t border-border pt-3 text-xs space-y-2">
            {!rubric.ok && (
              <div className="italic text-muted-foreground">Fallback shown — AI service unavailable.</div>
            )}
            {(rubric.total_score != null || rubric.max_score != null) && (
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-base">
                  {rubric.total_score ?? '—'} / {rubric.max_score ?? '—'}
                </span>
                <span className="text-muted-foreground">overall</span>
              </div>
            )}
            {rubric.summary && <p className="leading-relaxed">{rubric.summary}</p>}
            {rubric.criteria && rubric.criteria.length > 0 && (
              <ul className="space-y-1.5">
                {rubric.criteria.map((c, i) => (
                  <li key={c.id ?? i} className="border border-border rounded-md p-2 bg-muted/30">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{c.label ?? c.id ?? `Criterion ${i + 1}`}</span>
                      <span className="kuja-numeric text-[hsl(var(--kuja-clay))]">
                        {c.score ?? '—'} / {c.max ?? '—'}
                      </span>
                    </div>
                    {c.rationale && (
                      <p className="mt-1 text-muted-foreground leading-relaxed">{c.rationale}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Budget classifier */}
      <div className="border border-border rounded-lg bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Calculator className="w-4 h-4 text-[hsl(var(--kuja-spark))] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">Direct-to-community ratio</h3>
              <p className="text-xs text-muted-foreground">
                Classify each budget line as direct community spend, operational, or
                indirect, and compare against the window&apos;s {isConsortium ? 'consortium' : 'single-org'} threshold.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={runBudget}
            disabled={budgetBusy}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold bg-[hsl(var(--kuja-spark))] text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {budgetBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Classify
          </button>
        </div>
        <textarea
          value={budgetText}
          onChange={(e) => setBudgetText(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full font-mono text-[11px] px-2 py-1.5 rounded-md border border-border bg-background"
          placeholder="One line per item: label, amount"
        />
        {budget && (
          <div className="border-t border-border pt-3 text-xs space-y-2">
            {!budget.ok && (
              <div className="italic text-muted-foreground">Fallback shown — AI service unavailable.</div>
            )}
            {(budget.direct_pct != null || budget.total != null) && (
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-semibold text-base">
                  {budget.direct_pct != null ? budget.direct_pct.toFixed(1) : '—'}%
                </span>
                <span className="text-muted-foreground">
                  direct-to-community of total{budget.total != null ? ` ${budget.total.toLocaleString()}` : ''}
                </span>
                {budget.threshold_pct != null && (
                  <span
                    className={
                      budget.meets_threshold
                        ? 'text-[hsl(var(--kuja-grow))] font-semibold'
                        : 'text-destructive font-semibold'
                    }
                  >
                    {budget.meets_threshold ? '✓ meets' : '✗ below'} {budget.threshold_pct}% threshold
                  </span>
                )}
              </div>
            )}
            {budget.summary && <p className="leading-relaxed">{budget.summary}</p>}
            {budget.classifications && budget.classifications.length > 0 && (
              <ul className="space-y-1">
                {budget.classifications.map((c, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-1 last:border-0">
                    <span className="truncate min-w-0 flex-1">{c.item ?? `Line ${i + 1}`}</span>
                    <span className="text-muted-foreground kuja-numeric">
                      {c.amount != null ? Number(c.amount).toLocaleString() : '—'}
                    </span>
                    <span
                      className={
                        c.bucket === 'direct'
                          ? 'text-[hsl(var(--kuja-grow))] font-semibold capitalize'
                          : c.bucket === 'operational'
                          ? 'text-[hsl(var(--kuja-sun))] capitalize'
                          : 'text-muted-foreground capitalize'
                      }
                    >
                      {c.bucket ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
