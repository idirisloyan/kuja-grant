'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  unread: number;
}

export function UnreadNotificationsStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-unread-notifications').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.unread === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-xs flex items-center justify-between">
      <span className="text-amber-900 dark:text-amber-200 inline-flex items-center gap-1">
        <Bell className="w-3 h-3 text-amber-600" />
        Notifications
      </span>
      <span className="tabular-nums text-amber-900 dark:text-amber-200">
        <span className="font-semibold">{data.unread}</span> unread
      </span>
    </div>
  );
}
