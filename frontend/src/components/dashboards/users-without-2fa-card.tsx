'use client';

/**
 * Phase 357 — Admin users-without-2FA tile.
 *
 * Counts privileged users (admin/donor/reviewer) without TOTP. Lists 5
 * samples. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Item {
  id: number;
  name: string;
  role: string;
}

interface Resp {
  total: number;
  sample: Item[];
}

export function UsersWithoutTwoFaCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/users-without-2fa').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <ShieldOff className="w-4 h-4 text-amber-700" />
          Users without 2FA
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.total} privileged user{data.total === 1 ? '' : 's'} have not enrolled TOTP.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.sample.map((u) => (
            <li key={u.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate">{u.name}</span>
              <span className="text-muted-foreground shrink-0">{u.role}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
