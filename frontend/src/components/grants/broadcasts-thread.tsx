'use client';

/**
 * Phase 194 — Broadcasts thread for a grant.
 *
 * Reads /api/grants/<id>/broadcasts (Phase 190) and renders the message
 * history newest first. Visible to: donor that owns the grant, admin,
 * and NGOs that have an application on this grant.
 */

import { useEffect, useState } from 'react';
import { Megaphone, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

interface BroadcastItem {
  seq: number;
  sender_email: string | null;
  sent_at: string | null;
  audience: string | null;
  subject: string | null;
  body: string | null;
  orgs_targeted: number | null;
  users_notified: number | null;
}

interface Resp {
  broadcasts: BroadcastItem[];
}

export function BroadcastsThread({ grantId }: { grantId: number }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>(`/api/grants/${grantId}/broadcasts`).then((r) => {
      if (!cancelled) setData(r);
    }).catch(() => {/* silent */}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [grantId]);

  if (loading) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" />
        Loading broadcasts…
      </Card>
    );
  }
  if (!data || data.broadcasts.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 space-y-3">
      <header>
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Megaphone className="w-3.5 h-3.5 text-[hsl(var(--kuja-clay))]" />
          Broadcasts to applicants
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.broadcasts.length} message{data.broadcasts.length === 1 ? '' : 's'}, newest first.
        </p>
      </header>
      <ul className="space-y-3">
        {data.broadcasts.map((b) => (
          <li key={b.seq} className="rounded-md border border-border p-3">
            <header className="flex items-start justify-between gap-2 flex-wrap mb-1">
              <div>
                <div className="text-sm font-semibold">{b.subject ?? 'Broadcast'}</div>
                <div className="text-[11px] text-muted-foreground">
                  from {b.sender_email ?? 'sender'}
                  {b.sent_at && <> · {new Date(b.sent_at).toLocaleString()}</>}
                </div>
              </div>
              {b.users_notified != null && (
                <span className="text-[11px] text-muted-foreground">
                  reached {b.users_notified} user{b.users_notified === 1 ? '' : 's'}
                  {b.orgs_targeted != null && <> across {b.orgs_targeted} org{b.orgs_targeted === 1 ? '' : 's'}</>}
                </span>
              )}
            </header>
            {b.body && (
              <p className="text-sm whitespace-pre-wrap leading-relaxed mt-1.5 text-foreground">
                {b.body}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
