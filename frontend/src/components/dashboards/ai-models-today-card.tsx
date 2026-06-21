'use client';

import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface ModelRow {
  model: string;
  count: number;
}

interface Resp {
  models: ModelRow[];
}

export function AiModelsTodayCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-ai-models-today').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.models.length === 0) return null;
  const max = Math.max(1, ...data.models.map((m) => m.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Cpu className="w-4 h-4 text-sky-600" />
          AI models (last 24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {data.models.map((m) => (
            <li key={m.model} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px]">{m.model}</span>
                <span className="tabular-nums font-medium">{m.count}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-sky-500" style={{ width: `${(m.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
