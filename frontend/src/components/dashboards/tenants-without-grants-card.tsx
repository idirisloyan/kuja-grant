'use client';

import { useEffect, useState } from 'react';
import { Building } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  tenants_without_grants: number;
  donor_orgs: number;
}

export function TenantsWithoutGrantsCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/tenants-without-grants').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.tenants_without_grants === 0) return null;
  const pct = data.donor_orgs > 0 ? Math.round((data.tenants_without_grants / data.donor_orgs) * 100) : 0;
  const high = pct >= 50;

  return (
    <Card className={high ? 'border-amber-200' : undefined}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Building className={`w-4 h-4 ${high ? 'text-amber-600' : 'text-sky-600'}`} />
          Donor tenants without grants
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {data.tenants_without_grants}
          <span className="text-base text-muted-foreground font-normal"> / {data.donor_orgs}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {pct}% of donor-type tenants have never published a grant.
        </p>
      </CardContent>
    </Card>
  );
}
