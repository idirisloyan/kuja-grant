'use client';

/**
 * Phase 273 — NGO "compare your 3 most recent apps" CTA tile.
 *
 * Shows a single-click button to the existing /applications/compare
 * page pre-loaded with the NGO's 3 most recent non-draft applications.
 * Hidden when the NGO has < 2 such applications.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Columns } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow { id: number; status: string; submitted_at: string | null }
interface Resp { applications: AppRow[] }

export function CompareMyAppsCard() {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/applications?per_page=20').then((r) => {
      if (cancelled) return;
      const list = Array.isArray(r?.applications) ? r.applications : [];
      const non_drafts = list
        .filter((a) => a.status !== 'draft')
        .sort((a, b) => {
          const ta = a.submitted_at ? Date.parse(a.submitted_at) : 0;
          const tb = b.submitted_at ? Date.parse(b.submitted_at) : 0;
          return tb - ta;
        })
        .slice(0, 3)
        .map((a) => a.id);
      setIds(non_drafts);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (ids.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Columns className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Compare your recent applications
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          Side-by-side criterion responses for your {ids.length} most recent applications.
        </p>
        <Link
          href={`/applications/compare?ids=${ids.join(',')}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--kuja-clay))] text-white text-xs font-medium px-3 py-1.5 hover:opacity-90"
        >
          Open compare view
        </Link>
      </CardContent>
    </Card>
  );
}
