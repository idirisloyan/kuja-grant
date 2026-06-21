'use client';

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  enrollment_pct: number | null;
  enrolled: number;
  total: number;
}

export function TotpEnrollmentCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-totp-enrollment-rate').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.enrollment_pct == null) return null;
  const pct = data.enrollment_pct;
  const tone = pct >= 75 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-rose-700';
  const low = pct < 50;

  return (
    <Card className={low ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <KeyRound className={`w-4 h-4 ${low ? 'text-amber-600' : 'text-sky-600'}`} />
          TOTP enrollment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{pct}%</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.enrolled} of {data.total} users have set up TOTP.
        </p>
      </CardContent>
    </Card>
  );
}
