'use client';

/**
 * Phase 259 — Donor "applications by sector" rollup tile.
 *
 * Reads stats.apps_by_sector populated by /api/dashboard/stats.
 * Hidden when empty.
 */

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Row { sector: string; count: number }

interface Resp { apps_by_sector?: Row[] }

export function SectorRollupCard() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/dashboard/stats').then((r) => {
      if (cancelled) return;
      setRows(Array.isArray(r?.apps_by_sector) ? r.apps_by_sector : []);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Layers className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Applications by sector
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.sector} className="flex items-center justify-between text-sm">
            <span className="truncate mr-2">{r.sector}</span>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-[hsl(var(--kuja-clay))]"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <span className="tabular-nums text-xs text-muted-foreground">{r.count}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
