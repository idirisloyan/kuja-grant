'use client';

/**
 * AIBudgetCard — Phase 13.39.
 *
 * Surfaces the /api/admin/ai-spend/forecast projection on the
 * observability page. Shows trailing-window daily-average + 30-day
 * projection vs. KUJA_AI_BUDGET_USD_30D (default $250).
 *
 * Tone-coded:
 *   - ok           sky / muted (forecast < 80% of budget)
 *   - watch        amber (80%–100% of budget — heads-up zone)
 *   - over_budget  red (forecast > budget — admin should act)
 *
 * Renders nothing while loading and a soft empty-state on fetch error;
 * we never want this card to be a noisy second-class panel.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ForecastResponse {
  success: boolean;
  trailing_days: number;
  trailing_total_usd: number;
  daily_avg_usd: number;
  forecast_30d_usd: number;
  budget_30d_usd: number;
  headroom_pct: number;
  status: 'ok' | 'watch' | 'over_budget';
  as_of: string;
  note?: string;
}

export function AIBudgetCard() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<ForecastResponse>('/admin/ai-spend/forecast?trailing_days=14')
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError((e as Error).message || 'load failed'); });
    return () => { cancelled = true; };
  }, []);

  if (error || !data) return null;

  const tone = data.status === 'over_budget'
    ? { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-800', label: 'Over budget' }
    : data.status === 'watch'
      ? { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-800', label: 'Heads-up' }
      : { border: 'border-sky-300', bg: 'bg-sky-50', text: 'text-sky-800', label: 'On track' };

  const headroomDisplay = data.headroom_pct >= 0
    ? `${data.headroom_pct.toFixed(0)}% headroom`
    : `${Math.abs(data.headroom_pct).toFixed(0)}% over`;

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {data.status === 'over_budget' ? (
            <AlertCircle className={`h-5 w-5 flex-shrink-0 ${tone.text}`} />
          ) : (
            <TrendingUp className={`h-5 w-5 flex-shrink-0 ${tone.text}`} />
          )}
          <div>
            <div className={`text-[10px] uppercase tracking-wider font-bold ${tone.text}`}>
              AI spend forecast · {tone.label}
            </div>
            <div className="mt-1 text-sm text-foreground">
              Projected{' '}
              <span className="font-semibold kuja-numeric">${data.forecast_30d_usd.toFixed(2)}</span>{' '}
              over the next 30 days vs. budget{' '}
              <span className="font-semibold kuja-numeric">${data.budget_30d_usd.toFixed(0)}</span>{' '}
              <span className={`ml-1 ${tone.text} font-medium`}>({headroomDisplay})</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Based on the trailing {data.trailing_days} days · daily avg{' '}
              <span className="kuja-numeric">${data.daily_avg_usd.toFixed(3)}</span>
            </div>
          </div>
        </div>
      </div>
      {data.status === 'over_budget' && data.note && (
        <p className="mt-3 text-xs text-muted-foreground">{data.note}</p>
      )}
    </div>
  );
}
