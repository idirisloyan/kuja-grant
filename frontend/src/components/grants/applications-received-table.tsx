'use client';

/**
 * Phase 229 — Mini-table of applications received for a single grant.
 *
 * Donor-only. Reads /api/applications?grant_id=X and renders a small
 * table sorted by AI score descending. Shows up to 10 rows + a "see
 * all" link. Hidden when no submissions yet.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AppRow {
  id: number;
  org_name?: string;
  ngo_org_name?: string;
  country?: string;
  status: string;
  ai_score: number | null;
  human_score: number | null;
  is_starred?: boolean;
}

interface Resp {
  applications: AppRow[];
}

export function ApplicationsReceivedTable({ grantId }: { grantId: number }) {
  const [rows, setRows] = useState<AppRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/applications?grant_id=${grantId}&per_page=50`).then((r) => {
      if (cancelled) return;
      const apps = Array.isArray(r?.applications) ? r.applications : [];
      // Don't include drafts — donors only see submitted forward.
      const filtered = apps.filter((a) => a.status !== 'draft');
      filtered.sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1));
      setRows(filtered.slice(0, 10));
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, [grantId]);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Inbox className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Applications received
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
              <tr>
                <th className="px-2 py-1.5 text-left">Org</th>
                <th className="px-2 py-1.5 text-left">Country</th>
                <th className="px-2 py-1.5 text-right">AI</th>
                <th className="px-2 py-1.5 text-right">Human</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-b-0">
                  <td className="px-2 py-1.5">
                    {a.is_starred && <span className="text-[hsl(var(--kuja-clay))] mr-1">★</span>}
                    <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                      {a.org_name ?? a.ngo_org_name ?? `App #${a.id}`}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-xs">{a.country ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.ai_score != null ? Math.round(a.ai_score) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.human_score != null ? Math.round(a.human_score) : '—'}</td>
                  <td className="px-2 py-1.5 text-xs">
                    <code className="text-[10px]">{a.status}</code>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Link href={`/applications/${a.id}`} className="text-xs text-[hsl(var(--kuja-clay))] hover:underline">
                      open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-2 text-right">
          <Link
            href={`/applications?grant_id=${grantId}`}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            See all applications →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
