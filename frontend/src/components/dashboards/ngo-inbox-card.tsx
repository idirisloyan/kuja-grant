'use client';

/**
 * Phase 227 — NGO combined open-requests inbox.
 *
 * Single tile that surfaces unread notifications across the
 * actionable categories: doc requests, revision requests, reviewer
 * assignments. Click → application/grant. Hidden when nothing
 * pending. Cap at 8 most recent across categories.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Notif {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  created_at: string | null;
  read_at?: string | null;
}

interface Resp {
  notifications: Notif[];
}

const WATCH_TYPES = [
  'application_document_requested',
  'application_revision_requested',
  'application_under_review',
  'compliance_refreshed',
];

const LABEL: Record<string, string> = {
  application_document_requested: 'Doc request',
  application_revision_requested: 'Revision',
  application_under_review: 'Under review',
  compliance_refreshed: 'Compliance',
};

export function NgoInboxCard() {
  const [rows, setRows] = useState<Notif[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      WATCH_TYPES.map((t) =>
        api.get<Resp>(`/api/notifications?type=${t}&unread_only=true&per_page=4`).catch(() => null)
      ),
    ).then((results) => {
      if (cancelled) return;
      const all: Notif[] = [];
      for (const r of results) {
        if (r?.notifications) all.push(...r.notifications);
      }
      all.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta;
      });
      setRows(all.slice(0, 8));
    });
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Inbox className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Open requests ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((n) => (
          <Link
            key={n.id}
            href={n.link || '#'}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium truncate mr-2">{n.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                {LABEL[n.type] ?? n.type}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">{n.message}</div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
