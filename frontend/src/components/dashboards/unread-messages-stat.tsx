'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  unread: number;
}

export function UnreadMessagesStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/ngo-unread-messages').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.unread === 0) return null;

  return (
    <a
      href="/messages"
      className="rounded-md border border-sky-300 bg-sky-50/70 dark:bg-sky-950/20 p-3 text-xs flex items-center justify-between hover:bg-sky-50 transition-colors"
    >
      <span className="text-sky-900 dark:text-sky-200 inline-flex items-center gap-1">
        <Mail className="w-3 h-3 text-sky-600" />
        Inbox
      </span>
      <span className="tabular-nums text-sky-900 dark:text-sky-200">
        <span className="font-semibold">{data.unread}</span> unread message
        {data.unread === 1 ? '' : 's'}
      </span>
    </a>
  );
}
