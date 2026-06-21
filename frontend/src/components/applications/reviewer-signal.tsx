'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  application_id: number;
  total: number;
  by_status: {
    assigned: number;
    in_progress: number;
    completed: number;
  };
}

export function ReviewerSignal({ applicationId }: { applicationId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>(`/api/dashboard/ngo-app-reviewer-signal/${applicationId}`).then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, [applicationId]);

  if (loading || !data) return null;
  const active = data.by_status.assigned + data.by_status.in_progress;
  if (active === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-md bg-sky-50 border border-sky-200 text-sky-800 px-3 py-1.5 text-sm">
      <Users className="w-4 h-4" />
      <span>
        Your application has been picked up.{' '}
        {data.by_status.in_progress > 0
          ? `${data.by_status.in_progress} review${data.by_status.in_progress === 1 ? ' is' : 's are'} in progress.`
          : `${data.by_status.assigned} reviewer${data.by_status.assigned === 1 ? '' : 's'} assigned.`}
      </span>
    </div>
  );
}
