'use client';

/**
 * Phase 340 — NGO "documents pending upload" tile.
 *
 * Counts applications where the latest doc-request notification is
 * newer than the latest doc upload. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  count: number;
  application_ids: number[];
}

export function NgoDocsPendingCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/ngo-docs-pending').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.count === 0) return null;

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Upload className="w-4 h-4 text-amber-700" />
          Documents pending upload
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.count} application{data.count === 1 ? '' : 's'} need an upload.
        </p>
        <ul className="space-y-1 text-xs pt-1">
          {data.application_ids.map((id) => (
            <li key={id} className="border-l-2 border-amber-300 pl-2">
              <Link href={`/applications/${id}`} className="text-[hsl(var(--kuja-clay))] hover:underline">
                Application #{id}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
