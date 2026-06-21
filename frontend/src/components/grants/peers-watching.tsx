'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  grant_id: number;
  others_watching: number;
}

export function PeersWatching({ grantId }: { grantId: number }) {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/dashboard/peers-watching-grant/${grantId}`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [grantId]);

  if (!data || data.others_watching === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
      <Eye className="w-4 h-4 text-sky-600" />
      <span>
        <span className="font-semibold tabular-nums">{data.others_watching}</span>
        {' '}other organisation{data.others_watching === 1 ? '' : 's'} watching
      </span>
    </div>
  );
}
