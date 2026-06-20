'use client';

/**
 * Phase 197 — Per-network member directory page.
 *
 * Reads /api/network/membership/directory. Visible to active members +
 * admins. Lists every active member org with sector + country +
 * capacity score so members can find each other for collaboration.
 */

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Users, Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Member {
  org_id: number;
  org_name: string;
  country: string | null;
  sectors: string[];
  member_tier: string;
  capacity_score: number | null;
  joined_at: string | null;
}

interface Resp {
  members: Member[];
  total: number;
}

export default function NetworkDirectoryPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/network/membership/directory').then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toLowerCase();
    if (!ql) return data.members;
    return data.members.filter((m) => {
      return (
        m.org_name.toLowerCase().includes(ql)
        || (m.country || '').toLowerCase().includes(ql)
        || m.sectors.some((s) => s.toLowerCase().includes(ql))
      );
    });
  }, [data, q]);

  return (
    <PageShell>
      <PageHeader
        title="Member directory"
        icon={Users}
        subtitle={
          data ? `${data.total} active member${data.total === 1 ? '' : 's'}` : 'Loading…'
        }
      />
      <PageMain>
        {loading && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </div>
        )}
        {data && (
          <Card className="p-4 space-y-3">
            <label className="block">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, country, or sector…"
                  className="w-full rounded-md border border-border bg-background pl-8 pr-2 py-1.5 text-sm"
                />
              </div>
            </label>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left">Org</th>
                    <th className="px-3 py-2 text-left">Country</th>
                    <th className="px-3 py-2 text-left">Sectors</th>
                    <th className="px-3 py-2 text-right">Capacity</th>
                    <th className="px-3 py-2 text-left">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.org_id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">
                        <Link href={`/ngo/${m.org_id}`} className="font-medium hover:underline">
                          {m.org_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">{m.country ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {m.sectors.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {m.capacity_score != null ? Math.round(m.capacity_score) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{m.member_tier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No members match this filter.
              </p>
            )}
          </Card>
        )}
      </PageMain>
    </PageShell>
  );
}
