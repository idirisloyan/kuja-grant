'use client';

/**
 * Phase 212 — NGO "documents requested" inbox tile.
 *
 * Surfaces unread notifications of type `application_document_requested`
 * (created by Phase 202). Click → /applications/<id>. Hidden when none
 * pending. Limit to 5 most recent.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FilePlus2 } from 'lucide-react';
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

export function DocsRequestedCard() {
  const [rows, setRows] = useState<Notif[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<Resp>('/api/notifications?type=application_document_requested&unread_only=true&per_page=5').then((r) => {
      if (cancelled) return;
      const list = Array.isArray(r?.notifications) ? r.notifications : [];
      setRows(list);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base inline-flex items-center gap-2">
          <FilePlus2 className="w-4 h-4 text-[hsl(var(--kuja-clay))]" />
          Documents requested ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((n) => (
          <Link
            key={n.id}
            href={n.link || '#'}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <div className="font-medium truncate">{n.title}</div>
            <div className="text-xs text-muted-foreground truncate">{n.message}</div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
