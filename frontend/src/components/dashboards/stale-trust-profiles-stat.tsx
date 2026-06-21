'use client';

import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function StaleTrustProfilesStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/admin-stale-trust-profiles').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <UserX className="w-3 h-3 text-amber-600" />
        Dormant NGOs (90d)
      </span>
      <span className="tabular-nums font-semibold">{data.count}</span>
    </div>
  );
}
