'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  decisions: number;
  median_days: number | null;
  funded_pct: number | null;
}

export function DonorTrackRecord({ donorOrgId }: { donorOrgId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>(`/api/dashboard/donor-track-record/${donorOrgId}`).then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, [donorOrgId]);

  if (loading || !data || data.decisions === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs inline-flex items-center gap-2">
      <History className="w-4 h-4 text-sky-600" />
      <span>
        <span className="font-semibold tabular-nums">{data.decisions}</span> decisions last year
        {data.median_days != null && (
          <>
            {' · '}
            <span className="font-semibold tabular-nums">{data.median_days}d</span> median wait
          </>
        )}
        {data.funded_pct != null && (
          <>
            {' · '}
            <span className="font-semibold tabular-nums">{data.funded_pct}%</span> funded
          </>
        )}
      </span>
    </div>
  );
}
