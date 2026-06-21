'use client';

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  countries: Array<{ country: string; count: number }>;
  total: number;
}

export function AppsByCountryCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/donor-apps-by-country').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;
  const topCount = data.countries[0]?.count || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Globe className="w-4 h-4 text-sky-600" />
          Applications by country
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1.5">
          {data.countries.map((c) => (
            <li key={c.country} className="flex items-center gap-2">
              <span className="w-24 truncate">{c.country}</span>
              <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-sky-500"
                  style={{ width: `${(c.count / topCount) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums text-xs text-muted-foreground">
                {c.count}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Across {data.total} application{data.total === 1 ? '' : 's'}.
        </p>
      </CardContent>
    </Card>
  );
}
