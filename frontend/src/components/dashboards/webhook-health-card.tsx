'use client';

/**
 * Phase 286 — Admin webhook health tile.
 *
 * Reads /api/webhooks/admin/health and surfaces 24h rollup: ok / failed /
 * retrying counts + the 3 noisiest webhooks by failure count. Hidden
 * when there's no traffic at all.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Webhook, AlertTriangle, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  window_hours: number;
  ok: number;
  failed: number;
  retrying: number;
  total: number;
  noisiest: Array<{ webhook_id: number; url: string | null; failures: number }>;
}

export function WebhookHealthCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/webhooks/admin/health').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  const hasFailures = data.failed > 0;

  return (
    <Card className={hasFailures ? 'border-amber-300' : ''}>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Webhook className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Webhook deliveries (24h)
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="flex gap-4 text-xs">
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <Check className="w-3 h-3" /> {data.ok} ok
          </span>
          {data.failed > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="w-3 h-3" /> {data.failed} failed
            </span>
          )}
          {data.retrying > 0 && (
            <span className="text-xs text-muted-foreground">
              {data.retrying} retried
            </span>
          )}
        </div>
        {data.noisiest.length > 0 && (
          <div className="border-t border-border pt-2 mt-2 space-y-1">
            <p className="text-xs text-muted-foreground">Noisiest:</p>
            {data.noisiest.map((n) => (
              <p key={n.webhook_id} className="text-xs truncate">
                <span className="font-mono">{n.url || `#${n.webhook_id}`}</span>
                <span className="text-amber-700"> · {n.failures}</span>
              </p>
            ))}
          </div>
        )}
        <Link href="/admin/webhooks" className="block text-xs text-[hsl(var(--kuja-clay))] hover:underline">
          Open webhooks →
        </Link>
      </CardContent>
    </Card>
  );
}
