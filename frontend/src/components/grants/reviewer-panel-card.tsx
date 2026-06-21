'use client';

/**
 * Phase 278 — Donor reviewer panel diversity check.
 *
 * Lists distinct reviewers assigned to the grant's applications +
 * flags any org with > 1 reviewer (potential COI risk). Hidden when
 * panel is empty.
 */

import { useEffect, useState } from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Reviewer {
  user_id: number;
  name: string | null;
  email: string;
  org_name: string | null;
}
interface Resp { reviewers: Reviewer[]; org_duplicates: string[] }

export function ReviewerPanelCard({ grantId }: { grantId: number }) {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/grants/${grantId}/reviewer-panel`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [grantId]);

  if (!data || data.reviewers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Users className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Reviewer panel ({data.reviewers.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {data.org_duplicates.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-xs inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>
              Multiple reviewers from: <strong>{data.org_duplicates.join(', ')}</strong>. Check for COI.
            </span>
          </div>
        )}
        {data.reviewers.map((r) => (
          <div key={r.user_id} className="flex items-center justify-between text-sm rounded-md px-2 py-1">
            <span>{r.name ?? r.email}</span>
            <span className="text-xs text-muted-foreground">{r.org_name ?? '—'}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
