'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface OrgTypeRow {
  org_type: string;
  count: number;
}

interface Resp {
  total: number;
  by_type: OrgTypeRow[];
}

export function NewOrgsThisWeekCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-new-orgs-this-week').then((r) => {
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
          <Building2 className="w-4 h-4 text-sky-600" />
          New organizations (7d)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{data.total}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.by_type.slice(0, 4).map((t) => `${t.count} ${t.org_type}`).join(', ')}.
        </p>
      </CardContent>
    </Card>
  );
}
