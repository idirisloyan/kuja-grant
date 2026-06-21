'use client';

/**
 * Phase 279 — Admin audit chain integrity tile.
 *
 * Reads /api/audit-chain/verify and surfaces "chain intact" / "N breaks
 * found" status with deep link to /admin/audit-chain. Always visible
 * on the operator dashboard so a break can't go unnoticed.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Link2, Link2Off, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  ok: boolean;
  total_checked: number;
  breaks?: Array<{ id: number; reason: string }>;
}

export function AuditIntegrityCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/audit-chain/verify?limit=1000').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2" /> Verifying audit chain…
      </div>
    );
  }
  if (!data) return null;

  return (
    <Card className={data.ok ? '' : 'border-rose-300'}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          {data.ok
            ? <Link2 className="w-4 h-4 text-emerald-600" />
            : <Link2Off className="w-4 h-4 text-rose-600" />}
          Audit chain
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {data.ok ? (
          <p className="text-emerald-700">
            Chain intact across the last {data.total_checked.toLocaleString()} entries.
          </p>
        ) : (
          <p className="text-rose-700">
            {(data.breaks ?? []).length} break{(data.breaks ?? []).length === 1 ? '' : 's'} detected — investigate immediately.
          </p>
        )}
        <Link href="/admin/audit-chain" className="text-xs text-[hsl(var(--kuja-clay))] hover:underline">
          Open audit chain →
        </Link>
      </CardContent>
    </Card>
  );
}
