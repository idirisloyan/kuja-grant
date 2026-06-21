'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  this_month: number;
  same_month_last_year: number;
  month_label: string;
}

export function SubmissionsThisMonthCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-submissions-this-month').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.this_month === 0) return null;
  const diff = data.this_month - data.same_month_last_year;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Calendar className="w-4 h-4 text-sky-600" />
          Submissions this month
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{data.this_month}</div>
        <p className="text-xs text-muted-foreground">
          {data.month_label} ·{' '}
          {data.same_month_last_year === 0
            ? 'no submissions same month last year'
            : `${diff > 0 ? '+' : ''}${diff} vs same month last year (${data.same_month_last_year})`}
        </p>
      </CardContent>
    </Card>
  );
}
