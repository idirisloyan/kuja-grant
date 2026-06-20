'use client';

/**
 * Phase 154 — Per-NGO impact summary tile.
 *
 * Rolling 12-month: applications submitted, awards, total funding
 * awarded, reports submitted, win rate. Source: GET /api/journey/impact.
 * Self-gates: returns null if the NGO has no activity in window.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, Award, FileCheck, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

interface Resp {
  window_days: number;
  applications_submitted: number;
  awards_count: number;
  win_rate_pct: number | null;
  reports_submitted: number;
  total_funding_awarded: number;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function ImpactCard() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/journey/impact').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;
  // Hide entirely if no activity in window — first-time NGOs would just
  // see zeroes, which is demoralizing.
  if (data.applications_submitted === 0 && data.reports_submitted === 0) {
    return null;
  }

  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--kuja-grow))]" />
          Last 12 months
        </h3>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Submitted
          </div>
          <div className="font-serif text-xl">{data.applications_submitted}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Award className="w-3 h-3" /> Awarded
          </div>
          <div className="font-serif text-xl">
            {data.awards_count}
            {data.win_rate_pct !== null && (
              <span className="text-xs text-muted-foreground ml-1">
                ({data.win_rate_pct}%)
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Total funding
          </div>
          <div className="font-serif text-xl">
            {data.total_funding_awarded > 0 ? fmtMoney(data.total_funding_awarded) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <FileCheck className="w-3 h-3" /> Reports
          </div>
          <div className="font-serif text-xl">{data.reports_submitted}</div>
        </div>
      </div>
    </Card>
  );
}
