'use client';

import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface DupGroup {
  normalized_name: string;
  country: string | null;
  count: number;
  orgs: Array<{ id: number; name: string; country: string | null; org_type: string }>;
}

interface Resp {
  duplicates: DupGroup[];
  total_groups: number;
}

export function DuplicateOrgsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/duplicate-orgs').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total_groups === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Copy className="w-4 h-4 text-amber-600" />
          Possible duplicate orgs
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          {data.total_groups} group{data.total_groups === 1 ? '' : 's'} of orgs sharing the same name + country.
        </p>
        <ul className="space-y-2">
          {data.duplicates.map((g, i) => (
            <li key={i} className="border-l-2 border-amber-200 pl-2">
              <div className="font-medium truncate">{g.normalized_name}</div>
              <div className="text-xs text-muted-foreground">
                {g.country || 'no country'} · {g.count} orgs ({g.orgs.map((o) => `#${o.id}`).join(', ')})
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
