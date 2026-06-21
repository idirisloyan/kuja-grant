'use client';

/**
 * Phase 305 — Admin data integrity tile.
 *
 * Surfaces orphaned FKs across core tables. Self-gates when zero.
 */

import { useEffect, useState } from 'react';
import { ShieldX } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Resp {
  total: number;
  issues: {
    reviews_missing_application: number | null;
    applications_missing_grant: number | null;
    documents_missing_application: number | null;
  };
}

const LABELS: Record<string, string> = {
  reviews_missing_application: 'Reviews whose application is gone',
  applications_missing_grant: 'Applications whose grant is gone',
  documents_missing_application: 'Documents whose application is gone',
};

export function DataIntegrityCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/dashboard/data-integrity').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  if (loading || !data || data.total === 0) return null;

  return (
    <Card className="border-rose-300">
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <ShieldX className="w-4 h-4 text-rose-700" />
          Data integrity
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.total} orphan reference{data.total === 1 ? '' : 's'} detected.
        </p>
        <ul className="text-xs space-y-0.5 pt-1">
          {Object.entries(data.issues).map(([k, v]) => {
            if (typeof v !== 'number' || v === 0) return null;
            return (
              <li key={k} className="flex justify-between gap-2">
                <span>{LABELS[k] || k}</span>
                <span className="text-rose-700 tabular-nums">{v}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
