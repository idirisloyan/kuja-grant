'use client';

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface OrgRow {
  id: number;
  name: string;
  org_type: string | null;
  users: number;
}

interface Resp {
  orgs: OrgRow[];
}

export function TopOrgsByUsersCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/admin-top-orgs-by-users').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.orgs.length === 0) return null;
  const max = Math.max(1, ...data.orgs.map((o) => o.users));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Users2 className="w-4 h-4 text-sky-600" />
          Top orgs by user count
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {data.orgs.map((o) => (
            <li key={o.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {o.name}
                  {o.org_type && <span className="ml-1 text-muted-foreground">· {o.org_type}</span>}
                </span>
                <span className="tabular-nums font-medium">{o.users}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-sky-500" style={{ width: `${(o.users / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
