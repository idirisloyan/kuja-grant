'use client';

/**
 * Phase 172 — NGO inbox tile: new grants matching saved searches.
 *
 * Pulls notifications of kind 'grant_published_match' (Phase 167 fan
 * out), resolves each to a grant title + link. Self-gates if there
 * are no unread matches.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

interface NotificationItem {
  id: number;
  type: string;
  title?: string;
  message?: string;
  link?: string | null;
  read?: boolean;
  created_at?: string;
}

export function NewGrantMatchesCard() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ notifications: NotificationItem[] }>('/api/notifications/?limit=30').then((r) => {
      if (cancelled) return;
      const matches = (r.notifications ?? [])
        .filter((n) => n.type === 'grant_published_match' && !n.read)
        .slice(0, 5);
      setItems(matches);
    }).catch(() => {/* silent */});
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  return (
    <Card className="p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-amber-500" />
          New grants matching your saved searches
        </h3>
        <span className="text-[11px] text-muted-foreground">{items.length} unread</span>
      </header>
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              href={n.link || '/grants'}
              className="block rounded-md border border-border p-2 hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {n.title || 'New grant matching your saved search'}
                  </div>
                  {n.message && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {n.message}
                    </div>
                  )}
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
