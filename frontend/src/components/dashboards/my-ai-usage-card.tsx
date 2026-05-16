'use client';

/**
 * MyAIUsageCard — own-org AI spend transparency (Phase 6).
 *
 * The NGO / donor counterpart to the admin AIBudgetAdminCard. Shows the
 * org's month-to-date AI usage in plain language:
 *   - "$0.42 spent of $5.00 budget" with a progress bar
 *   - or "$0.42 spent (no cap set)" when unlimited
 *
 * Designed for a sidebar/utility slot — compact, single-card. Renders
 * nothing until /api/ai-budget/me responds, so it never causes layout
 * shifts.
 */

import { useEffect, useState } from 'react';
import { Wallet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface BudgetStatus {
  allowed: boolean;
  spent_usd: number;
  budget_usd: number | null;
  remaining_usd: number | null;
  reason: string;
}

function tone(pct: number | null) {
  if (pct === null) return 'text-[hsl(var(--kuja-grow))]';
  if (pct >= 100) return 'text-[hsl(var(--kuja-flag))]';
  if (pct >= 80) return 'text-[hsl(var(--kuja-sun))]';
  return 'text-[hsl(var(--kuja-grow))]';
}

function barColor(pct: number | null) {
  if (pct === null) return 'bg-[hsl(var(--kuja-grow))]';
  if (pct >= 100) return 'bg-[hsl(var(--kuja-flag))]';
  if (pct >= 80) return 'bg-[hsl(var(--kuja-sun))]';
  return 'bg-[hsl(var(--kuja-grow))]';
}

export function MyAIUsageCard({ className }: { className?: string }) {
  const [data, setData] = useState<BudgetStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<{ status: BudgetStatus }>('/api/ai-budget/me')
      .then((d) => { if (!cancelled) setData(d.status); })
      .catch(() => { /* render nothing on failure — non-essential surface */ });
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  const isCapped = data.budget_usd !== null;
  const pct = isCapped ? Math.round((data.spent_usd / (data.budget_usd as number)) * 100) : null;
  const overCap = !data.allowed;

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-md bg-[hsl(var(--kuja-grow)/0.1)]">
          <Wallet className="w-4 h-4 text-[hsl(var(--kuja-grow))]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="kuja-eyebrow">AI usage this month</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="kuja-numeric text-lg font-semibold">{formatMoney(data.spent_usd, { currency: 'USD' })}</span>
            {isCapped ? (
              <span className="text-xs text-[hsl(var(--kuja-ink-soft))]">
                of {formatMoney(data.budget_usd as number, { currency: 'USD' })}
              </span>
            ) : (
              <span className="text-xs text-[hsl(var(--kuja-ink-soft))]">no cap set</span>
            )}
          </div>

          {isCapped && (
            <>
              <div className="mt-2 h-1.5 rounded-full bg-[hsl(var(--kuja-ink-soft)/0.15)] overflow-hidden">
                <div
                  className={cn('h-full transition-all duration-300', barColor(pct))}
                  style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
                />
              </div>
              <p className={cn('mt-1.5 text-[11px]', tone(pct))}>
                {overCap ? (
                  <><AlertTriangle className="w-3 h-3 inline mr-1" />
                  Over cap — AI calls now defer to template fallback.</>
                ) : (
                  <><CheckCircle2 className="w-3 h-3 inline mr-1" />
                  {pct}% of cap used · {formatMoney(data.remaining_usd ?? 0, { currency: 'USD' })} remaining</>
                )}
              </p>
            </>
          )}

          {!isCapped && (
            <p className="mt-1.5 text-[11px] text-[hsl(var(--kuja-ink-soft))]">
              Your org has no monthly AI cap. Ask your admin to set one in dashboard settings.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
