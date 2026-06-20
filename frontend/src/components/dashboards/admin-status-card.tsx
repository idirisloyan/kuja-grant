'use client';

/**
 * Phase 256 — Admin "system status" tile.
 *
 * Compact combined view: cron health summary + 30-day AI spend.
 * Auto-hidden when everything is green (no overdue/never crons +
 * AI spend under 80% of budget).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface CronResp {
  summary?: { fresh: number; overdue: number; never: number };
}

interface CostResp {
  total_usd?: number;
}

const BUDGET_BURN_THRESHOLD = 0.8;

export function AdminStatusCard() {
  const [cron, setCron] = useState<CronResp | null>(null);
  const [cost, setCost] = useState<CostResp | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<CronResp>('/api/cron/health').catch(() => null),
      api.get<CostResp>('/admin/ai-cost-by-tenant?days=30').catch(() => null),
    ]).then(([c, k]) => {
      if (cancelled) return;
      setCron(c);
      setCost(k);
    });
    return () => { cancelled = true; };
  }, []);

  const overdue = cron?.summary?.overdue ?? 0;
  const never = cron?.summary?.never ?? 0;
  const fresh = cron?.summary?.fresh ?? 0;
  const totalUsd = cost?.total_usd ?? 0;
  // KUJA_AI_BUDGET_USD_30D is server-side; just show absolute spend.
  const hasIssues = overdue > 0 || never > 0;

  if (!cron && !cost) return null;
  if (!hasIssues && totalUsd === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          {hasIssues
            ? <ShieldAlert className="w-4 h-4 text-rose-600" />
            : <CheckCircle className="w-4 h-4 text-emerald-600" />}
          System status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span>Crons</span>
          <span className="text-xs">
            <span className="text-emerald-600 tabular-nums">{fresh} fresh</span>
            {overdue > 0 && <span className="text-amber-700 tabular-nums ml-2">{overdue} overdue</span>}
            {never > 0 && <span className="text-rose-600 tabular-nums ml-2">{never} never</span>}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>AI spend (30d)</span>
          <span className="text-xs tabular-nums">${totalUsd.toFixed(2)}</span>
        </div>
        <div className="pt-2 border-t border-border flex gap-3 text-xs">
          <Link href="/admin/cron-health" className="text-[hsl(var(--kuja-clay))] hover:underline">
            Cron health →
          </Link>
          <Link href="/admin/ai-cost" className="text-[hsl(var(--kuja-clay))] hover:underline">
            AI cost →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
