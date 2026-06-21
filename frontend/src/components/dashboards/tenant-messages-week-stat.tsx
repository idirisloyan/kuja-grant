'use client';

import { useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function TenantMessagesWeekStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/admin-tenant-messages-this-week').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <MessagesSquare className="w-3 h-3 text-violet-600" />
        Tenant messages (7d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> sent</span>
      </span>
    </div>
  );
}
