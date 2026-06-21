'use client';

import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { api } from '@/lib/api';

interface Resp {
  count: number;
}

export function WebauthnRegistrationsStat() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/admin-webauthn-registrations-this-month').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.count === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs flex items-center justify-between">
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Fingerprint className="w-3 h-3 text-violet-600" />
        WebAuthn registered (30d)
      </span>
      <span className="tabular-nums">
        <span className="font-semibold">{data.count}</span>
        <span className="text-muted-foreground"> credential{data.count === 1 ? '' : 's'}</span>
      </span>
    </div>
  );
}
