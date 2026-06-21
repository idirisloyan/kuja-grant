'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  approval_pct: number | null;
  funded?: number;
  sample: number;
}

export function ApprovalRateCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-approval-rate-year').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.approval_pct == null) return null;
  const pct = data.approval_pct;
  const tone = pct >= 50 ? 'text-emerald-700' : pct >= 25 ? 'text-amber-700' : 'text-rose-700';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Approval rate this year
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{pct}%</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.funded ?? 0} funded out of {data.sample} decisions year-to-date.
        </p>
      </CardContent>
    </Card>
  );
}
