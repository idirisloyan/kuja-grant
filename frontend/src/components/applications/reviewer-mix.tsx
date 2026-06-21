'use client';

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  application_id: number;
  total_reviewers: number;
  active: number;
  completed: number;
  progress_pct: number | null;
}

export function ReviewerMix({ applicationId }: { applicationId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>(`/api/dashboard/ngo-app-reviewer-mix/${applicationId}`).then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, [applicationId]);

  if (loading || !data || data.total_reviewers === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
      <Users2 className="w-4 h-4 text-sky-600" />
      <span>
        Review progress:{' '}
        <span className="font-semibold tabular-nums">{data.completed}</span>/
        <span className="tabular-nums">{data.total_reviewers}</span>
        {' '}reviewers complete
        {data.active > 0 && (
          <span className="text-muted-foreground"> · {data.active} in progress</span>
        )}
      </span>
    </div>
  );
}
