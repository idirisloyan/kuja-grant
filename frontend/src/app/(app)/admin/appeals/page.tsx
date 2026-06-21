'use client';

/**
 * Phase 307 — Admin pending appeals queue.
 *
 * Lists all applications with appeal_requested_at set + appeal_resolved_at
 * NULL, oldest first. Provides quick link into each application detail
 * so the admin can pre-investigate before nudging the donor.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import {
  PageShell, PageHeader, PageMain,
} from '@/components/layout/page-shell';

interface Row {
  application_id: number;
  ngo_org_name: string | null;
  grant_title: string | null;
  donor_org_id: number | null;
  appeal_requested_at: string | null;
  days_pending: number | null;
  reason_excerpt: string | null;
}

interface Resp {
  appeals: Row[];
  total: number;
}

export default function AdminAppealsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = { cancelled: false };
    api.get<Resp>('/api/applications/appeals').then((r) => {
      if (!state.cancelled) setData(r);
    }).catch(() => { if (!state.cancelled) setData(null); })
      .finally(() => { if (!state.cancelled) setLoading(false); });
    return () => { state.cancelled = true; };
  }, []);

  return (
    <PageShell>
      <PageHeader title="Pending appeals" icon={Scale} subtitle="Re-review requests awaiting donor / admin action" />
      <PageMain>
        {loading && (
          <p className="text-sm text-muted-foreground py-2">Loading…</p>
        )}
        {!loading && (!data || data.appeals.length === 0) && (
          <Card>
            <CardContent className="py-6 text-sm text-center text-muted-foreground">
              No pending appeals. Nothing to do.
            </CardContent>
          </Card>
        )}
        {data && data.appeals.length > 0 && (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {data.appeals.map((a) => (
                <Link
                  key={a.application_id}
                  href={`/applications/${a.application_id}`}
                  className="block px-4 py-3 hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {a.ngo_org_name || `Application #${a.application_id}`}
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-muted-foreground">{a.grant_title || 'grant'}</span>
                      </p>
                      {a.reason_excerpt && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {a.reason_excerpt}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-amber-700">
                        {a.days_pending != null ? `${a.days_pending}d pending` : 'pending'}
                      </p>
                      <ChevronRight className="w-4 h-4 inline text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </PageMain>
    </PageShell>
  );
}
