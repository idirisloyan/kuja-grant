'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  themes: Array<{ reason_code: string; count: number }>;
  total: number;
}

function pretty(code: string) {
  return code
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function NgoFeedbackThemesCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-feedback-themes').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.themes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-sky-600" />
          Decline reason themes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1">
          {data.themes.map((t) => (
            <li key={t.reason_code} className="flex items-baseline justify-between gap-3">
              <span className="truncate">{pretty(t.reason_code)}</span>
              <span className="tabular-nums text-xs text-muted-foreground">
                {t.count}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Top reasons across {data.total} past decline{data.total === 1 ? '' : 's'}.
        </p>
      </CardContent>
    </Card>
  );
}
