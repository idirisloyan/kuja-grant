'use client';

/**
 * Phase 166 — Donor portfolio summary tile.
 *
 * Rolling 12-month: grants published, total committed, applications
 * received, awarded, reports. Reads /api/journey/donor-summary.
 * Self-gates: hides when there's no activity in window.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, DollarSign, FileCheck, Award, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

interface Resp {
  window_days: number;
  grants_published: number;
  total_funding_committed: number;
  applications_received: number;
  applications_awarded: number;
  reports_received: number;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function DonorPortfolioCard() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/journey/donor-summary').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;
  if (data.grants_published === 0 && data.applications_received === 0) {
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Grants
          </div>
          <div className="font-serif text-xl">{data.grants_published}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Committed
          </div>
          <div className="font-serif text-xl">
            {data.total_funding_committed > 0 ? fmtMoney(data.total_funding_committed) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Inbox className="w-3 h-3" /> Applications
          </div>
          <div className="font-serif text-xl">{data.applications_received}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Award className="w-3 h-3" /> Awarded
          </div>
          <div className="font-serif text-xl">{data.applications_awarded}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <FileCheck className="w-3 h-3" /> Reports
          </div>
          <div className="font-serif text-xl">{data.reports_received}</div>
        </div>
      </div>
    </Card>
  );
}
