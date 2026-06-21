'use client';

import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  counts: {
    assigned: number;
    in_progress: number;
    completed: number;
    snoozed: number;
  };
  total: number;
}

const ORDER: Array<{ key: keyof Resp['counts']; label: string }> = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'snoozed', label: 'Snoozed' },
];

export function ReviewPipelineCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-review-pipeline').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-sky-600" />
          Review pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1">
          {ORDER.filter((s) => data.counts[s.key] > 0).map((s) => (
            <li key={s.key} className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="tabular-nums font-medium">{data.counts[s.key]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.total} review{data.total === 1 ? '' : 's'} on your grants.
        </p>
      </CardContent>
    </Card>
  );
}
