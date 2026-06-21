'use client';

import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  counts: Record<string, number>;
}

const KEYS: Array<{ key: string; label: string }> = [
  { key: 'users', label: 'Users' },
  { key: 'organizations', label: 'Orgs' },
  { key: 'grants', label: 'Grants' },
  { key: 'applications', label: 'Applications' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'notifications', label: 'Notifications' },
];

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

export function DbRowCountsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/db-row-counts').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Database className="w-4 h-4 text-sky-600" />
          DB row counts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {KEYS.map((k) => (
            <li key={k.key} className="flex items-baseline justify-between">
              <span className="text-muted-foreground">{k.label}</span>
              <span className="tabular-nums font-medium">
                {fmt(data.counts[k.key] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
